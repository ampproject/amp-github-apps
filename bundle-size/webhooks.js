/**
 * Copyright 2018, the AMP HTML authors
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
'use strict';

const {formatBundleSizeDelta, getCheckFromDatabase} = require('./common');

/**
 * Installs GitHub Webhooks on the Probot application.
 *
 * @param {!Probot.Application} app Probot application.
 * @param {!Knex} db database connection.
 * @param {!GitHubUtils} githubUtils GitHubUtils instance.
 */
exports.installGitHubWebhooks = (app, db, githubUtils) => {
  app.on(['pull_request.opened', 'pull_request.synchronize'], async context => {
    context.log(`Pull request ${context.payload.number} created/updated`);

    const headSha = context.payload.pull_request.head.sha;
    const params = context.repo({
      name: 'ampproject/bundle-size',
      head_sha: headSha,
      output: {
        title: 'Calculating new bundle size for this PR…',
        summary:
          'The bundle size (brotli compressed size of `v0.js`) ' +
          'of this pull request is being calculated on Travis. Look for the ' +
          'shard that contains "Bundle Size" in its title.',
      },
    });
    const check = await context.github.checks.create(params);

    const checkRunId = check.data.id;
    await db.transaction(trx => {
      return trx('checks')
        .first('head_sha')
        .where('head_sha', headSha)
        .then(existingRow => {
          if (existingRow === undefined) {
            return trx('checks').insert({
              head_sha: headSha,
              pull_request_id: context.payload.number,
              installation_id: context.payload.installation.id,
              owner: params.owner,
              repo: params.repo,
              check_run_id: checkRunId,
            });
          } else {
            return trx('checks')
              .update({check_run_id: checkRunId})
              .where({head_sha: headSha});
          }
        })
        .then(trx.commit)
        .catch(trx.rollback);
    });
  });

  app.on('pull_request.closed', async context => {
    if (context.payload.pull_request.merged_at !== null) {
      await db('merges').insert({
        merge_commit_sha: context.payload.pull_request.merge_commit_sha,
      });
    }
  });

  app.on('pull_request_review.submitted', async context => {
    const approver = context.payload.review.user.login;
    const pullRequestId = context.payload.pull_request.number;
    const headSha = context.payload.pull_request.head.sha;

    if (context.payload.review.state !== 'approved') {
      return;
    }

    const check = await getCheckFromDatabase(db, headSha);
    if (!check) {
      context.log(
        `Check ID for pull request ${pullRequestId} with head ` +
          `SHA ${headSha} was not found in the database`
      );
      return;
    }

    const isSuperApprover = await githubUtils.isSuperApprover(approver);
    if (
      (check.delta === null || check.approval_teams === null) &&
      !isSuperApprover
    ) {
      context.log(
        'Pull requests can only be preemptively approved by members of',
        process.env.SUPER_USER_TEAMS
      );
      return;
    }

    const approverTeams = check.approving_teams
      ? check.approving_teams.split(',')
      : [];
    if (approverTeams.length) {
      // TODO(#617, danielrozenberg): use the result of `isApprover` and
      // `isSuperApprover` instead of the legacy logic below.
      const isApprover = (
        await githubUtils.getTeamMembers(approverTeams)
      ).includes(approver);
      context.log(
        `Approving user ${approver} of pull request ${pullRequestId}`,
        isApprover ? 'is' : 'is NOT',
        'a member of',
        approverTeams
      );
    }

    // TODO(#617, danielrozenberg): remove the legacy logic below.
    if (!(await githubUtils.isBundleSizeApproverLegacy(approver))) {
      return;
    }

    context.log(
      `Pull request ${pullRequestId} approved by a bundle-size keeper`
    );

    const bundleSizeDelta = parseFloat(check.delta);
    if (bundleSizeDelta <= process.env['MAX_ALLOWED_INCREASE']) {
      return;
    }
    const approvalMessagePrefix = formatBundleSizeDelta(bundleSizeDelta);

    await context.github.checks.update({
      owner: check.owner,
      repo: check.repo,
      check_run_id: check.check_run_id,
      conclusion: 'success',
      completed_at: new Date().toISOString(),
      output: {
        title: `${approvalMessagePrefix} | approved by @${approver}`,
        summary:
          'The bundle size (brotli compressed size of `v0.js`) of this pull ' +
          `request was approved by ${approver}`,
      },
    });
  });

  app.on('check_run.created', async context => {
    const mergeCommitSha = context.payload.check_run.head_sha;

    const numDeleted = await db('merges')
      .del()
      .where({merge_commit_sha: mergeCommitSha});
    if (numDeleted > 0) {
      await context.github.checks.update(
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
              `master/bundle-size/${mergeCommitSha}`,
          },
        })
      );
    }
  });
};
