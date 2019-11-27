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

const {
  formatBundleSizeDelta,
  getCheckFromDatabase,
  isBundleSizeApprover,
} = require('./common');
const {GitHubUtils} = require('./github-utils');
const sleep = require('sleep-promise');

const RETRY_MILLIS = 60000;
const RETRY_TIMES = 60;

const HUMAN_ENCOURAGEMENT_MAX_DELTA = -0.03;

/**
 * Returns an explanation on why the check failed when the bundle size is
 * increased.
 *
 * @param {number} baseRuntimeDelta bundle size delta in KB.
 * @param {!Array<string>} otherBundleSizeDeltas text description of other
 *   bundle size changes.
 * @param {!Array<string>} missingBundleSizes text description of missing bundle
 *   sizes from other `master` or the pull request.
 * @return {{title: string, summary: string}} check output.
 */
function failedCheckOutput(
  baseRuntimeDelta,
  otherBundleSizeDeltas,
  missingBundleSizes
) {
  const baseRuntimeDeltaFormatted = formatBundleSizeDelta(baseRuntimeDelta);
  return {
    title: `${baseRuntimeDeltaFormatted} | approval required`,
    summary:
      'This pull request has increased the bundle size (brotli compressed ' +
      `size of \`v0.js\`) by ${baseRuntimeDeltaFormatted}. As part of an ` +
      'ongoing effort to reduce the bundle size, this change requires special' +
      'approval.\n' +
      'A member of the bundle-size group will be added automatically to ' +
      'review this PR. Only once the member approves this PR, can it be ' +
      'merged. If you do not receive a response from the group member, feel ' +
      `free to tag another person in ${process.env.REVIEWER_TEAM_NAMES}` +
      extraBundleSizesSummary(otherBundleSizeDeltas, missingBundleSizes),
  };
}

/**
 * Returns an encouraging result summary when the bundle size is reduced.
 * Otherwise the summary is neutral, but not discouraging.
 *
 * @param {number} baseRuntimeDelta bundle size delta in KB.
 * @param {!Array<string>} otherBundleSizeDeltas text description of other
 *   bundle size changes.
 * @param {!Array<string>} missingBundleSizes text description of missing bundle
 *   sizes from other `master` or the pull request.
 * @return {{title: string, summary: string}} check output.
 */
function successfulCheckOutput(
  baseRuntimeDelta,
  otherBundleSizeDeltas,
  missingBundleSizes
) {
  const baseRuntimeDeltaFormatted = formatBundleSizeDelta(baseRuntimeDelta);
  const title = `${baseRuntimeDeltaFormatted} | no approval necessary`;
  let summary;
  if (baseRuntimeDelta <= HUMAN_ENCOURAGEMENT_MAX_DELTA) {
    summary =
      'This pull request *reduces* the bundle size (brotli compressed size ' +
      'of `v0.js`), so no special approval is necessary. The bundle size ' +
      `change is ${baseRuntimeDeltaFormatted}.`;
  } else {
    summary =
      'This pull request does not change the bundle size (brotli compressed ' +
      'size of `v0.js`) by any significant amount, so no special approval is ' +
      `necessary. The bundle size change is ${baseRuntimeDeltaFormatted}.`;
  }

  summary += extraBundleSizesSummary(otherBundleSizeDeltas, missingBundleSizes);

  return {title, summary};
}

/**
 * Returns a result summary to indicate that an error has occurred.
 *
 * @param {string} partialBaseSha the base sha this PR's commit is compared
 *   against.
 * @return {{title: string, summary: string}} check output.
 */
function erroredCheckOutput(partialBaseSha) {
  return {
    title: `Failed to retrieve the bundle size of branch point ${partialBaseSha}`,
    summary:
      'The bundle size (brotli compressed size of `v0.js`) of this pull ' +
      'request could not be determined because the base size (that is, the ' +
      'bundle size of the `master` commit that this pull request was ' +
      'compared against) was not found in the ' +
      '`https://github.com/ampproject/amphtml-build-artifacts` ' +
      'repository. This can happen due to failed or delayed Travis builds on ' +
      'said `master` commit.\n' +
      'A member of the bundle-size group will be added automatically to ' +
      'review this PR. Only once the member approves this PR, can it be ' +
      'merged. If you do not receive a response from the group member, feel ' +
      `free to tag another person in ${process.env.REVIEWER_TEAM_NAMES}`,
  };
}

/**
 * Return formatted extra changes to append to the check output summary.
 *
 * @param {!Array<string>} otherBundleSizeDeltas text description of other
 *   bundle size changes.
 * @param {!Array<string>} missingBundleSizes text description of missing bundle
 *   sizes from other `master` or the pull request.
 * @return {string} formatted extra changes;
 */
function extraBundleSizesSummary(otherBundleSizeDeltas, missingBundleSizes) {
  return (
    '\n\n' +
    '## Other bundle sizes\n' +
    otherBundleSizeDeltas.concat(missingBundleSizes).join('\n')
  );
}

/**
 * Choose the set of all the potential approver teams into a single team.
 *
 * Could end up choosing the fallback set defined in the `.env` file, even if
 * the fallback set is not in the input.
 *
 * @param {!Array<!Array<string>>} allPotentialApproverTeams all the potential
 *   teams that can approve this pull request.
 * @param {!Logger} log logging function/object.
 * @param {number} pullRequestId the pull request ID.
 * @return {!Array<string>} the selected subset of all potential approver teams
 *   that can approve this bundle-size change.
 */
function choosePotentialApproverTeams(
  allPotentialApproverTeams,
  log,
  pullRequestId
) {
  let potentialApproverTeams;
  switch (allPotentialApproverTeams.length) {
    case 0:
      potentialApproverTeams = [];
      log(
        `Pull request #${pullRequestId} does not require ` +
          'bundle-size approval'
      );
      break;

    case 1:
      potentialApproverTeams = allPotentialApproverTeams[0];
      log(
        `Pull request #${pullRequestId} requires approval ` +
          `from members of one of: ${potentialApproverTeams.join(', ')}`
      );
      break;

    default:
      potentialApproverTeams = process.env.FALLBACK_APPROVER_TEAMS.split(',');
      log(
        `Pull request #${pullRequestId} requires approval from ` +
          'multiple sets of teams, so we fall back to the default set ' +
          `of: ${potentialApproverTeams.join(', ')}`
      );
      break;
  }
  return potentialApproverTeams;
}

exports.installApiRouter = (app, db, userBasedGithub) => {
  const githubUtils = new GitHubUtils(userBasedGithub, app.log);

  /**
   * Try to report the bundle size of a pull request to the GitHub check.
   *
   * @param {!object} check GitHub Check object.
   * @param {string} baseSha commit SHA of the base commit being compared to.
   * @param {!Map<string, number>} prBundleSizes the bundle sizes of various
   *   dist files in the pull request in KB.
   * @param {boolean} lastAttempt true if this is the last retry.
   * @return {boolean} true if succeeded; false otherwise.
   */
  async function tryReport(check, baseSha, prBundleSizes, lastAttempt = false) {
    const github = await app.auth(check.installation_id);
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

    let masterBundleSizes;
    try {
      app.log(
        `Fetching master bundle-sizes on base commit ${baseSha} for pull ` +
          `request #${check.pull_request_id}`
      );
      masterBundleSizes = JSON.parse(
        await githubUtils.getBuildArtifactsFile(`${baseSha}.json`)
      );
    } catch (error) {
      const partialHeadSha = check.head_sha.substr(0, 7);
      const partialBaseSha = baseSha.substr(0, 7);
      app.log.error(
        'ERROR: Failed to retrieve the bundle size of ' +
          `${partialHeadSha} (PR #${check.pull_request_id}) with branch ` +
          `point ${partialBaseSha} from GitHub:\n`,
        error
      );
      if (lastAttempt) {
        app.log.warn('No more retries left. Reporting failure');
        Object.assign(updatedCheckOptions, {
          conclusion: 'action_required',
          output: erroredCheckOutput(partialBaseSha),
        });
        await github.checks.update(updatedCheckOptions);
        await addBundleSizeReviewer(github, {
          pull_number: check.pull_request_id,
          ...githubOptions,
        });
      }
      return false;
    }

    app.log(
      'Fetching mapping of file approvers and thresholds for pull request ' +
        `#${check.pull_request_id}`
    );
    const fileApprovers = await githubUtils.getFileApprovalsMapping();

    // Calculate and collect all (non-zero) bundle size deltas and list all dist
    // files that are missing either from master or from this pull request, and
    // all the potential teams that can approve above-threshold deltas.
    const bundleSizeDeltas = [];
    const missingBundleSizes = [];
    const allPotentialApproverTeams = new Set();
    for (const [file, baseBundleSize] of Object.entries(masterBundleSizes)) {
      if (!(file in prBundleSizes)) {
        missingBundleSizes.push(`* \`${file}\`: missing in pull request`);
        continue;
      }

      const bundleSizeDelta = prBundleSizes[file] - baseBundleSize;
      if (bundleSizeDelta !== 0) {
        bundleSizeDeltas.push(
          `* \`${file}\`: ${formatBundleSizeDelta(bundleSizeDelta)}`
        );
      }

      if (
        file in fileApprovers &&
        bundleSizeDelta >= fileApprovers[file].threshold
      ) {
        // Since `.approvers` is an array, it must be stringified to maintain
        // the Set uniqueness property.
        allPotentialApproverTeams.add(
          JSON.stringify(fileApprovers[file].approvers)
        );
      }
    }

    for (const [file, prBundleSize] of Object.entries(prBundleSizes)) {
      if (!(file in masterBundleSizes)) {
        missingBundleSizes.push(
          `* \`${file}\`: (${prBundleSize} KB) missing in \`master\``
        );
      }
    }

    // TODO(#617, danielrozenberg): replace the legacy logic below with logic
    // that uses the chosen approvers team list.
    // eslint-disable-next-line no-unused-vars
    const chosenApproverTeams = choosePotentialApproverTeams(
      Array.from(allPotentialApproverTeams).map(JSON.parse),
      app.log,
      check.pull_request_id
    );

    if (bundleSizeDeltas.length === 0) {
      bundleSizeDeltas.push(
        '* No bundle size changes reported in this pull request'
      );
    }

    app.log(
      'Done pre-processing bundle-size changes for pull request ' +
        `#${check.pull_request_id}:`
    );
    app.log(`Deltas:\n${bundleSizeDeltas.join('\n')}`);
    app.log(`Missing:\n${missingBundleSizes.join('\n')}`);

    // TODO(#617, danielrozenberg): this is a transitionary solution. This API
    // endpoint accepts a JSON with multiple bundle sizes, but for now it only
    // blocks on size changes in dist/v0.js. Everything from here down until the
    // return statement is legacy code.
    const baseRuntimeBundleSize = masterBundleSizes['dist/v0.js'];
    const baseRuntimeBundleSizeDelta =
      prBundleSizes['dist/v0.js'] - baseRuntimeBundleSize;

    await db('checks')
      .update({delta: baseRuntimeBundleSizeDelta})
      .where({head_sha: check.head_sha});

    const requiresApproval =
      baseRuntimeBundleSizeDelta > process.env['MAX_ALLOWED_INCREASE'];
    if (requiresApproval) {
      Object.assign(updatedCheckOptions, {
        conclusion: 'action_required',
        output: failedCheckOutput(
          baseRuntimeBundleSizeDelta,
          bundleSizeDeltas,
          missingBundleSizes
        ),
      });
    } else {
      Object.assign(updatedCheckOptions, {
        conclusion: 'success',
        output: successfulCheckOutput(
          baseRuntimeBundleSizeDelta,
          bundleSizeDeltas,
          missingBundleSizes
        ),
      });
    }
    await github.checks.update(updatedCheckOptions);

    if (requiresApproval) {
      await addBundleSizeReviewer(github, {
        pull_number: check.pull_request_id,
        ...githubOptions,
      });
    }

    return true;
  }

  /**
   * Add an bundle size reviewer to the pull request.
   *
   * Ignore errors as this is a non-critical action.
   *
   * @param {!github} github an authenticated GitHub API object.
   * @param {!object} pullRequest GitHub Pull Request object.
   */
  async function addBundleSizeReviewer(github, pullRequest) {
    const requestedReviewersResponse = await github.pullRequests.listReviewRequests(
      pullRequest
    );
    const reviewsResponse = await github.pullRequests.listReviews(pullRequest);
    const reviewers = new Set([
      ...requestedReviewersResponse.data.users.map(user => user.login),
      ...reviewsResponse.data.map(review => review.user.login),
    ]);
    for (const reviewer of reviewers) {
      if (await isBundleSizeApprover(userBasedGithub, reviewer)) {
        app.log(
          `INFO: Pull request ${pullRequest.pull_number} already has ` +
            'a bundle-size capable reviewer. Skipping...'
        );
        return;
      }
    }

    try {
      // Choose a random capable username and add them as a reviewer to the pull
      // request.
      const newReviewer = await githubUtils.getRandomReviewer();
      return await github.pullRequests.createReviewRequest({
        reviewers: [newReviewer],
        ...pullRequest,
      });
    } catch (error) {
      app.log.error(
        'ERROR: Failed to add a reviewer to pull request ' +
          `${pullRequest.pull_number}. Skipping...`
      );
      app.log.error(`Error message:\n`, error);
      throw error;
    }
  }

  const v0 = app.route('/v0');
  v0.use((request, response, next) => {
    request.app.set('trust proxy', true);
    if (
      'TRAVIS_IP_ADDRESSES' in process.env &&
      !process.env['TRAVIS_IP_ADDRESSES'].includes(request.ip)
    ) {
      app.log.warn(
        `Refused a request to ${request.originalUrl} from ${request.ip}`
      );
      response.status(403).end('You are not Travis!');
    } else {
      next();
    }
  });
  v0.use(require('express').json());

  v0.post('/commit/:headSha/skip', async (request, response) => {
    const {headSha} = request.params;
    app.log(`Marking SHA ${headSha} for skip`);

    const check = await getCheckFromDatabase(db, headSha);
    if (!check) {
      return response
        .status(404)
        .end(
          `${headSha} was not found in bundle-size database; try to rebase ` +
            'this pull request on the latest commit in the `master` to fix this'
        );
    }
    const github = await app.auth(check.installation_id);
    await github.checks.update({
      owner: check.owner,
      repo: check.repo,
      check_run_id: check.check_run_id,
      conclusion: 'neutral',
      completed_at: new Date().toISOString(),
      output: {
        title: 'check skipped because PR contains no runtime changes',
        summary:
          'An automated check has determined that the bundle size ' +
          '(brotli compressed size of `v0.js`) could not be affected by ' +
          'the files that this pull request modifies, so this check was ' +
          'marked as skipped.',
      },
    });
    response.end();
  });

  v0.post('/commit/:headSha/report', async (request, response) => {
    const {headSha} = request.params;
    const {baseSha, bundleSizes} = request.body;

    if (typeof baseSha !== 'string' || !/^[0-9a-f]{40}$/.test(baseSha)) {
      return response
        .status(400)
        .end('POST request to /report must have commit SHA field "baseSha"');
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
            'Map<string, number> field "bundleSizes", with at least one key ' +
            'set to "dist/v0.js"'
        );
    }

    const check = await getCheckFromDatabase(db, headSha);
    if (!check) {
      return response
        .status(404)
        .end(
          `${headSha} was not found in bundle-size database; try to rebase ` +
            'this pull request on the latest commit in the `master` to fix this'
        );
    }

    let reportSuccess = await tryReport(check, baseSha, bundleSizes);
    if (reportSuccess) {
      response.end();
    } else {
      response.status(202).end();
      let retriesLeft = RETRY_TIMES - 1;
      do {
        app.log(`Will retry ${retriesLeft} more time(s) in ${RETRY_MILLIS} ms`);
        await sleep(RETRY_MILLIS);
        retriesLeft--;
        reportSuccess = await tryReport(
          check,
          baseSha,
          bundleSizes,
          /* lastAttempt */ retriesLeft == 0
        );
      } while (retriesLeft > 0 && !reportSuccess);
    }
  });

  v0.post('/commit/:headSha/store', async (request, response) => {
    const {headSha} = request.params;
    const {bundleSizes} = request.body;

    if (request.body['token'] !== process.env.TRAVIS_PUSH_BUILD_TOKEN) {
      return response.status(403).end('You are not Travis!');
    }
    if (
      !bundleSizes ||
      Object.values(bundleSizes).some(value => typeof value !== 'number')
    ) {
      return response
        .status(400)
        .end(
          'POST request to /store must have a key/value object ' +
            'Map<string, number> field "bundleSizes"'
        );
    }

    const jsonBundleSizeFile = `${headSha}.json`;
    try {
      await githubUtils.getBuildArtifactsFile(jsonBundleSizeFile);
      app.log(
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
      app.log(
        `Stored the new bundle size file bundle-size/${jsonBundleSizeFile} ` +
          'the artifacts repository on GitHub'
      );
    } catch (error) {
      const errorMessage =
        `ERROR: Failed to create the bundle-size/${jsonBundleSizeFile} file ` +
        'in the build artifacts repository on GitHub! Error message was:';
      app.log.error(`${errorMessage}\n`, error);
      return response.status(500).end(`${errorMessage}\n${error}`);
    }

    response.end();
  });
};
