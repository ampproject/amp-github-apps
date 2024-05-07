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

import {RequestError} from '@octokit/request-error';
import {type Router, json} from 'express';
import {minimatch} from 'minimatch';
import sleep from 'sleep-promise';

import {
  type CheckRow,
  type StringCheckRow,
  formatBundleSizeDelta,
  getCheckFromDatabase,
} from './common';

import {
  PayloadRequest,
  ReportPayload,
  SkipPayload,
  StorePayload,
} from './types/payload';
import type {GitHubUtils} from './github-utils';
import type {Knex} from 'knex';
import type {Logger, Probot} from 'probot';
import type {RestEndpointMethodTypes} from '@octokit/plugin-rest-endpoint-methods';
import type {RestfulOctokit} from './types/rest-endpoint-methods';

type CheckOutput =
  RestEndpointMethodTypes['checks']['create']['parameters']['output'];

const RETRY_MILLIS = 60000;
const RETRY_TIMES = 60;

const SUMMARY_MAX_CHARACTERS = 48 * 1024;

const DRAFT_TITLE_REGEX =
  /\b(wip|work in progress|do not (merge|submit|review))\b/i;

/**
 * Returns an explanation on why the check failed when the bundle size is
 * increased.
 *
 * @param approverTeams all teams that can approve this bundle size change.
 * @param reportMarkdown text summarizing the bundle size changes and any
 *   missing files from the report,
 * @return check output.
 */
function failedCheckOutput(
  approverTeams: string[],
  reportMarkdown: string
): CheckOutput {
  return {
    title: `Approval required from one of [@${approverTeams.join(', @')}]`,
    summary:
      'This pull request has increased the brotli bundle size of the ' +
      'following files, and must be approved by a member of one of the ' +
      `following teams: @${approverTeams.join(', @')}\n\n` +
      `${reportMarkdown}\n\n` +
      'A randomly selected member of one of the above teams will be added ' +
      'as a reviewer of this PR. It can be merged once they approve it. ' +
      'If you do not receive a response, feel free to tag another team member.',
  };
}

/**
 * Returns an encouraging result summary when the bundle size is reduced.
 * Otherwise the summary is neutral, but not discouraging.
 *
 * @param reportMarkdown text summarizing the bundle size changes and any
 *   missing files from the report,
 * @return check output.
 */
function successfulCheckOutput(reportMarkdown: string): CheckOutput {
  return {
    title: `No approval necessary`,
    summary:
      'This pull request does not change any brotli bundle sizes by a ' +
      'significant amount, so no special approval is necessary.' +
      '\n\n' +
      reportMarkdown,
  };
}

/**
 * Returns a result summary to indicate that an error has occurred.
 *
 * @param partialBaseSha the base sha this PR's commit is compared against.
 * @return check output.
 */
function erroredCheckOutput(partialBaseSha: string): CheckOutput {
  const superUserTeams =
    '@' + process.env.SUPER_USER_TEAMS?.replace(/,/g, ', @') ?? 'repo owners';
  return {
    title: `Failed to retrieve the bundle size of branch point ${partialBaseSha}`,
    summary:
      'The brotli bundle sizes for this pull request could not be determined ' +
      'because the sizes for the baseline commit on the main branch were not ' +
      'found in the ' +
      '`https://github.com/ampproject/amphtml-build-artifacts` ' +
      'repository. This can happen due to failed or delayed CI builds for ' +
      'the main branch commit.\n\n' +
      'Possible solutions:\n' +
      '* Restart the `Bundle Size` job on CircleCI\n' +
      '* Rebase this PR on the latest main branch commit\n' +
      `* Notify ${superUserTeams}, who can override this failed check`,
  };
}

/**
 * Return formatted commit info and extra changes to append to the check output
 * summary.
 *
 * @param headSha commit being checked
 * @param baseSha baseline commit for comparison
 * @param mergeSha merge commit combining the head and base
 * @param bundleSizeDeltas text description of all bundle size changes.
 * @param missingBundleSizes text description of bundle sizes missing from the
 *   main branch.
 * @return formatted extra changes; truncated after 48 KB.
 */
function extraBundleSizesSummary(
  headSha: string,
  baseSha: string,
  mergeSha: string,
  bundleSizeDeltasRequireApproval: string[],
  bundleSizeDeltasAutoApproved: string[],
  missingBundleSizes: string[]
): string {
  let output =
    '## Commit details\n' +
    `**Head commit:** ${headSha}\n` +
    `**Base commit:** ${baseSha}\n` +
    `**Code changes:** ${
      mergeSha ||
      `https://github.com/ampproject/amphtml/compare/${baseSha}..${headSha}`
    }\n`;

  if (bundleSizeDeltasRequireApproval.length) {
    output +=
      '\n## Bundle size changes that require approval\n' +
      bundleSizeDeltasRequireApproval.join('\n');
  }
  if (bundleSizeDeltasAutoApproved.length) {
    output +=
      '\n## Auto-approved bundle size changes\n' +
      bundleSizeDeltasAutoApproved.join('\n');
  }
  if (missingBundleSizes.length) {
    output +=
      '\n## Bundle sizes missing from this PR\n' +
      missingBundleSizes.join('\n');
  }

  if (
    bundleSizeDeltasRequireApproval.length +
      bundleSizeDeltasAutoApproved.length +
      missingBundleSizes.length ===
    0
  ) {
    output += '\n**No bundle size changes were reported for this PR**';
  }

  if (output.length > SUMMARY_MAX_CHARACTERS) {
    output = output.slice(0, SUMMARY_MAX_CHARACTERS - 1) + '…';
  }

  return output;
}

/**
 * Choose the set of all the potential approver teams into a single team.
 *
 * Could end up choosing the fallback set defined in the `.env` file, even if
 * the fallback set is not in the input.
 *
 * @param allPotentialApproverTeams all the potential teams that can approve
 *   this pull request.
 * @param log logging function/object.
 * @param pullRequestId the pull request ID.
 * @return the selected subset of all potential approver teams that can approve
 *   this bundle-size change.
 */
function choosePotentialApproverTeams(
  allPotentialApproverTeams: string[][],
  log: Logger,
  pullRequestId: number
): string[] {
  let potentialApproverTeams: string[];
  switch (allPotentialApproverTeams.length) {
    case 0:
      potentialApproverTeams = [];
      log.info(
        `Pull request #${pullRequestId} does not require ` +
          'bundle-size approval'
      );
      break;

    case 1:
      potentialApproverTeams = allPotentialApproverTeams[0];
      log.info(
        `Pull request #${pullRequestId} requires approval ` +
          `from members of one of: ${potentialApproverTeams.join(', ')}`
      );
      break;

    default:
      potentialApproverTeams =
        process.env.FALLBACK_APPROVER_TEAMS?.split(',') ?? [];
      log.info(
        `Pull request #${pullRequestId} requires approval from ` +
          'multiple sets of teams, so we fall back to the default set ' +
          `of: ${potentialApproverTeams.join(', ')}`
      );
      break;
  }
  return potentialApproverTeams;
}

/**
 * Install the API router on the Probot application.
 *
 * @param app Probot application.
 * @param router Express server router.
 * @param db database connection.
 * @param githubUtils GitHubUtils instance.
 */
export function installApiRouter(
  log: Logger,
  githubAppAuthFunction: Probot['auth'],
  router: Router,
  db: Knex,
  githubUtils: GitHubUtils
): void {
  /**
   * Add a bundle size reviewer to add to the pull request.
   *
   * Does nothing if there is already a reviewer that can approve the bundle
   * size change.
   *
   * @param github an authenticated GitHub API object.
   * @param pullRequest GitHub Pull Request params.
   * @param approverTeams list of all the teams whose members can approve the
   *   bundle-size change of this pull request.
   * @return response from GitHub API or undefined.
   */
  async function addReviewer_(
    github: RestfulOctokit,
    pullRequest: RestEndpointMethodTypes['pulls']['listRequestedReviewers']['parameters'],
    approverTeams: string[]
  ) {
    const newReviewer = await githubUtils.chooseReviewer(
      pullRequest,
      approverTeams
    );
    if (newReviewer !== null) {
      try {
        // Choose a random capable username and add them as a reviewer to the pull
        // request.
        return await github.rest.pulls.requestReviewers({
          reviewers: [newReviewer],
          ...pullRequest,
        });
      } catch (error) {
        log.error(
          'ERROR: Failed to add a reviewer to pull request ' +
            `${pullRequest.pull_number}. Skipping...`
        );
        log.error(`Error message:\n`, error);
        throw error;
      }
    }
  }

  /**
   * Try to report the bundle size of a pull request to the GitHub check.
   *
   * @param check GitHub Check database object.
   * @param baseSha commit SHA of the base commit being compared to.
   * @param mergeSha commit SHA of the merge commit that combines the head and base.
   * @param prBundleSizes the bundle sizes of various dist files in the pull
   *   request in KB.
   * @param lastAttempt true if this is the last retry.
   * @return true if succeeded; false otherwise.
   */
  async function tryReport_(
    check: CheckRow,
    baseSha: string,
    mergeSha: string,
    prBundleSizes: Record<string, number>,
    lastAttempt = false
  ): Promise<boolean> {
    const partialHeadSha = check.head_sha.substring(0, 7);
    const partialBaseSha = baseSha.substring(0, 7);
    const partialMergeSha = mergeSha.substring(0, 7);
    const github = await githubAppAuthFunction(check.installation_id);
    const githubOptions = {
      owner: check.owner,
      repo: check.repo,
    };
    const updatedCheckOptions = {
      check_run_id: check.check_run_id,
      name: 'ampproject/bundle-size',
      completed_at: new Date().toISOString(),
      ...githubOptions,
    };
    const pullRequestOptions = {
      pull_number: check.pull_request_id,
      ...githubOptions,
    };

    const {data: pullRequest} = await github.rest.pulls.get(pullRequestOptions);

    let mainBundleSizes;
    try {
      log.info(
        `Fetching main branch bundle-sizes on base commit ${baseSha} for ` +
          `pull request #${check.pull_request_id}`
      );
      mainBundleSizes = await githubUtils.getBuildArtifactsFile(
        `${baseSha}.json`
      );
    } catch (error) {
      const fileNotFound =
        error instanceof RequestError && error.status === 404;

      if (fileNotFound) {
        log.warn(
          `Bundle size of ${partialBaseSha} (PR #${check.pull_request_id}) ` +
            'does not exist yet'
        );
      } else {
        // Any error other than 404 NOT FOUND is unexpected, and should be
        // rethrown instead of attempting to re-retrieve the file.
        log.error(
          'Unexpected error when trying to retrieve the bundle size of ' +
            `${partialHeadSha} (PR #${check.pull_request_id}) with branch ` +
            `point ${partialBaseSha} from GitHub:\n`,
          error
        );
        throw error;
      }

      if (lastAttempt) {
        log.warn('No more retries left. Reporting failure');
        Object.assign(updatedCheckOptions, {
          conclusion: 'action_required',
          output: erroredCheckOutput(partialBaseSha),
        });
        await github.rest.checks.update(updatedCheckOptions);
      }
      return false;
    }

    log.info(
      'Fetching mapping of file approvers and thresholds for pull request ' +
        `#${check.pull_request_id}`
    );
    const fileApprovers = await githubUtils.getFileApprovalsMapping();

    // Calculate and collect all (non-zero) bundle size deltas and list all dist
    // files that are missing either from the main branch or from this pull
    // request, and all the potential teams that can approve above-threshold
    // deltas.
    const bundleSizeDeltasRequireApproval = [];
    const bundleSizeDeltasAutoApproved = [];
    const missingBundleSizes = [];
    const allPotentialApproverTeams = new Set<string>();

    // When examining bundle-size check output for a PR, it's helpful to see
    // sizes at the extremes, so we sort from largest increase to largest
    // decrease. This ordering is reflected in the ordering of each subsection.
    const sortedBundleSizes = Object.entries(mainBundleSizes).sort(
      (a, b) => a[1] - b[1]
    );
    for (const [file, baseBundleSize] of sortedBundleSizes) {
      if (!(file in prBundleSizes)) {
        missingBundleSizes.push(`* \`${file}\`: missing in pull request`);
        continue;
      }

      const fileGlob = Object.keys(fileApprovers).find(fileGlob =>
        minimatch(file, fileGlob)
      );

      const bundleSizeDelta = prBundleSizes[file] - baseBundleSize;
      if (bundleSizeDelta !== 0) {
        if (fileGlob && bundleSizeDelta >= fileApprovers[fileGlob].threshold) {
          bundleSizeDeltasRequireApproval.push(
            `* \`${file}\`: ${formatBundleSizeDelta(bundleSizeDelta)}`
          );

          // Since `.approvers` is an array, it must be stringified to maintain
          // the Set uniqueness property.
          allPotentialApproverTeams.add(
            JSON.stringify(fileApprovers[fileGlob].approvers)
          );
        } else {
          bundleSizeDeltasAutoApproved.push(
            `* \`${file}\`: ${formatBundleSizeDelta(bundleSizeDelta)}`
          );
        }
      }
    }

    for (const [file, prBundleSize] of Object.entries(prBundleSizes)) {
      if (!(file in mainBundleSizes)) {
        missingBundleSizes.push(
          `* \`${file}\`: (${prBundleSize} KB) missing on the main branch`
        );
      }
    }

    const chosenApproverTeams = choosePotentialApproverTeams(
      Array.from(allPotentialApproverTeams).map(potentialApproverTeam =>
        JSON.parse(potentialApproverTeam)
      ),
      log,
      check.pull_request_id
    );
    const requiresApproval = Boolean(chosenApproverTeams.length);

    const reportMarkdown = extraBundleSizesSummary(
      partialHeadSha,
      partialBaseSha,
      partialMergeSha,
      bundleSizeDeltasRequireApproval,
      bundleSizeDeltasAutoApproved,
      missingBundleSizes
    );
    log.info(
      'Done pre-processing bundle-size changes for pull request ' +
        `#${check.pull_request_id}:\n${reportMarkdown}`
    );

    if (requiresApproval) {
      await db('checks')
        .update<StringCheckRow>({
          approving_teams: chosenApproverTeams.join(','),
          report_markdown: reportMarkdown,
        })
        .where({head_sha: check.head_sha});
      Object.assign(updatedCheckOptions, {
        conclusion: 'action_required',
        output: failedCheckOutput(chosenApproverTeams, reportMarkdown),
      });
    } else {
      Object.assign(updatedCheckOptions, {
        conclusion: 'success',
        output: successfulCheckOutput(reportMarkdown),
      });
    }
    await github.rest.checks.update(updatedCheckOptions);

    if (
      requiresApproval &&
      !pullRequest.draft &&
      !DRAFT_TITLE_REGEX.test(pullRequest.title)
    ) {
      await addReviewer_(github, pullRequestOptions, chosenApproverTeams);
    }

    return true;
  }

  router.use((request, response, next) => {
    request.app.set('trust proxy', true);
    next();
  });
  router.use(json());

  router.post(
    '/commit/:headSha/skip',
    async (request: PayloadRequest<SkipPayload>, response) => {
      const {headSha} = request.params;
      log.info(`Marking SHA ${headSha} for skip`);

      const check = await getCheckFromDatabase(db, headSha);
      if (!check) {
        return response
          .status(404)
          .end(
            `${headSha} was not found in bundle-size database; try to rebase ` +
              'this pull request on the main branch to fix this'
          );
      }
      const github = await githubAppAuthFunction(check.installation_id);
      await github.rest.checks.update({
        owner: check.owner,
        repo: check.repo,
        check_run_id: check.check_run_id,
        conclusion: 'neutral',
        completed_at: new Date().toISOString(),
        output: {
          title: 'Check skipped because PR contains no runtime changes',
          summary:
            'An automated check has determined that the brotli bundle size of ' +
            '`v0.js` could not be affected by the files modified by this this ' +
            'pull request, so this check was marked as skipped.',
        },
      });
      response.end();
    }
  );

  router.post(
    '/commit/:headSha/report',
    async (request: PayloadRequest<ReportPayload>, response) => {
      const {headSha} = request.params;
      // mergeSha is new, and not all reports will have it.
      // TODO(@danielrozenberg): make this required in a month or so
      const {baseSha, mergeSha = '', bundleSizes} = request.body;

      if (typeof baseSha !== 'string' || !/^[0-9a-f]{40}$/.test(baseSha)) {
        return response
          .status(400)
          .end('POST request to /report must have commit SHA field "baseSha"');
      }
      if (typeof mergeSha !== 'string' || !/^[0-9a-f]{40}$|^$/.test(mergeSha)) {
        return response
          .status(400)
          .end(
            'POST request to /report with "mergeSha" field must be a valid commit SHA'
          );
      }
      if (
        !bundleSizes ||
        Object.values(bundleSizes).some(value => typeof value !== 'number') ||
        !bundleSizes['dist/v0.js']
      ) {
        return response
          .status(400)
          .end(
            'POST request to /report.json must have a key/value object ' +
              'Record<string, number> field "bundleSizes", with at least one ' +
              'key set to "dist/v0.js"'
          );
      }

      const check = await getCheckFromDatabase(db, headSha);
      if (!check) {
        return response
          .status(404)
          .end(
            `${headSha} was not found in bundle-size database; try to rebase ` +
              'this pull request on the main branch to fix this'
          );
      }

      let reportSuccess: boolean;
      try {
        reportSuccess = await tryReport_(check, baseSha, mergeSha, bundleSizes);
        if (reportSuccess) {
          return response.status(200).end();
        }
      } catch (error) {
        const superUserTeams =
          '@' + process.env.SUPER_USER_TEAMS?.replace(/,/g, ', @') ??
          'repo owners';
        return response
          .status(500)
          .end(
            `The bundle-size bot encountered a server-side error: ${error}\n` +
              `Contact ${superUserTeams} for help.`
          );
      }

      /* explicit no return */ response.status(202).end();
      let retriesLeft = RETRY_TIMES - 1;
      do {
        log.info(
          `Will retry ${retriesLeft} more time(s) in ${RETRY_MILLIS} ms`
        );
        await sleep(RETRY_MILLIS);
        retriesLeft--;
        reportSuccess = await tryReport_(
          check,
          baseSha,
          mergeSha,
          bundleSizes,
          /* lastAttempt */ retriesLeft == 0
        );
      } while (retriesLeft > 0 && !reportSuccess);
    }
  );

  router.post(
    '/commit/:headSha/store',
    async (request: PayloadRequest<StorePayload>, response) => {
      const {headSha} = request.params;
      const {bundleSizes, token} = request.body;

      if (token !== process.env.CI_PUSH_BUILD_TOKEN) {
        return response.status(403).end('This is not a CI build!');
      }
      if (
        !bundleSizes ||
        Object.values(bundleSizes).some(value => typeof value !== 'number')
      ) {
        return response
          .status(400)
          .end(
            'POST request to /store must have a key/value object ' +
              'Record<string, number> field "bundleSizes"'
          );
      }

      const jsonBundleSizeFile = `${headSha}.json`;
      try {
        await githubUtils.getBuildArtifactsFile(jsonBundleSizeFile);
        log.info(
          `The file bundle-size/${jsonBundleSizeFile} already exists in the ` +
            'build artifacts repository on GitHub. Skipping...'
        );
        return response.end();
      } catch (unusedException) {
        // The file was not found in the GitHub repository, so continue to
        // create it...
      }

      try {
        const jsonBundleSizeText = JSON.stringify(bundleSizes);
        await githubUtils.storeBuildArtifactsFile(
          jsonBundleSizeFile,
          jsonBundleSizeText
        );
        log.info(
          `Stored the new bundle size file bundle-size/${jsonBundleSizeFile} ` +
            'the artifacts repository on GitHub'
        );
      } catch (error) {
        const errorMessage =
          `ERROR: Failed to create the bundle-size/${jsonBundleSizeFile} file ` +
          'in the build artifacts repository on GitHub! Error message was:';
        log.error(`${errorMessage}\n`, error);
        return response.status(500).end(`${errorMessage}\n${error}`);
      }

      response.end();
    }
  );
}
