/**
 * Copyright 2018 The AMP HTML Authors. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS-IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import {type StringCheckRow, getCheckFromDatabase} from './common';

import type {GitHubUtils} from './github-utils';
import type {Knex} from 'knex';
import type {Probot} from 'probot';

/**
 * Installs GitHub Webhooks on the Probot application.
 *
 * @param app Probot application.
 * @param db database connection.
 * @param githubUtils GitHubUtils instance.
 */
export function installGitHubWebhooks(
  app: Probot,
  db: Knex,
  githubUtils: GitHubUtils
) {
  app.on(['pull_request.opened', 'pull_request.synchronize'], async context => {
    context.log.info(`Pull request ${context.payload.number} created/updated`);

    const headSha = context.payload.pull_request.head.sha;
    const params = context.repo({
      name: 'ampproject/bundle-size',
      head_sha: headSha,
      output: {
        title: 'Calculating new bundle size for this PR…',
        summary:
          'Calculating bundle sizes (brotli compressed) with the changes from this pull request. ' +
          'Look for the shard that contains "Bundle Size" in its title.',
      },
    });
    const check = await context.octokit.rest.checks.create(params);

    const checkRunId = check.data.id;
    await db.transaction(async trx => {
      try {
        const existingRow = await trx('checks')
          .first('head_sha')
          .where('head_sha', headSha);

        if (existingRow === undefined) {
          await trx('checks').insert<StringCheckRow>({
            head_sha: headSha,
            pull_request_id: context.payload.number,
            installation_id: context.payload.installation?.id,
            owner: params.owner,
            repo: params.repo,
            check_run_id: checkRunId,
          });
        } else {
          await trx('checks')
            .update<StringCheckRow>({check_run_id: checkRunId})
            .where({head_sha: headSha});
        }
        await trx.commit();
      } catch (err) {
        await trx.rollback();
        app.log.error(err);
      }
    });
  });

  app.on('pull_request.closed', async context => {
    if (context.payload.pull_request.merged_at !== null) {
      await db('merges').insert<StringCheckRow>({
        merge_commit_sha: context.payload.pull_request.merge_commit_sha,
      });
    }
  });

  app.on('pull_request_review.submitted', async context => {
    const approver = context.payload.review.user?.login ?? '';
    const pullRequestId = context.payload.pull_request.number;
    const headSha = context.payload.pull_request.head.sha;

    if (context.payload.review.state !== 'approved') {
      return;
    }

    const check = await getCheckFromDatabase(db, headSha);
    if (!check) {
      context.log.info(
        `Check ID for pull request ${pullRequestId} with head ` +
          `SHA ${headSha} was not found in the database`
      );
      return;
    }

    const isSuperApprover = await githubUtils.isSuperApprover(approver);
    context.log.info(
      `Approving user ${approver} of pull request ${pullRequestId}`,
      isSuperApprover ? 'is' : 'is NOT',
      'a super approver'
    );
    if (check.approving_teams === null && !isSuperApprover) {
      context.log.info(
        'Pull requests can only be preemptively approved by members of',
        process.env.SUPER_USER_TEAMS
      );
      return;
    }

    const {approving_teams: approverTeams} = check;
    const isApprover =
      isSuperApprover ||
      (await githubUtils.getTeamMembers(approverTeams)).includes(approver);
    context.log.info(
      `Approving user ${approver} of pull request ${pullRequestId}`,
      isApprover && !isSuperApprover ? 'is' : 'is NOT',
      'a member of',
      approverTeams
    );

    let summary = `The bundle size change(s) of this pull request were approved by @${approver}`;
    if (check.report_markdown) {
      summary += `\n\n${check.report_markdown}`;
    }

    if (isApprover) {
      await context.octokit.rest.checks.update({
        owner: check.owner,
        repo: check.repo,
        check_run_id: check.check_run_id,
        conclusion: 'success',
        completed_at: new Date().toISOString(),
        output: {
          title: `approved by @${approver}`,
          summary,
        },
      });
    }
  });

  app.on('check_run.created', async context => {
    const mergeCommitSha = context.payload.check_run.head_sha;

    const numDeleted = await db('merges')
      .del()
      .where({merge_commit_sha: mergeCommitSha});
    if (numDeleted > 0) {
      await context.octokit.rest.checks.update(
        context.repo({
          check_run_id: context.payload.check_run.id,
          conclusion: 'neutral',
          completed_at: new Date().toISOString(),
          output: {
            title: 'Check skipped because this is a merged commit',
            summary:
              'The bundle-size of merged commits does not affect the ' +
              'status of this commit. However, since this is a required check ' +
              'on GitHub, a check is still created and must be resolved. You ' +
              'may safely ignore this bundle-size check.\n' +
              'To see the bundle-size at this commit, see ' +
              'https://github.com/ampproject/amphtml-build-artifacts/blob/' +
              `main/bundle-size/${mergeCommitSha}`,
          },
        })
      );
    }
  });
}
