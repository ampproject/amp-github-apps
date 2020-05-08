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
'use strict';

const sleep = require('sleep-promise');
const {formatBundleSizeDelta, getCheckFromDatabase} = require('./common');

const RETRY_MILLIS = 60000;
const RETRY_TIMES = 60;

/**
 * Returns an explanation on why the check failed when the bundle size is
 * increased.
 *
 * @param {!Array<string>} approverTeams all teams that can approve this
 *   bundle size change.
 * @param {!Array<string>} otherBundleSizeDeltas text description of other
 *   bundle size changes.
 * @param {!Array<string>} missingBundleSizes text description of missing bundle
 *   sizes from other `master` or the pull request.
 * @return {!Octokit.ChecksCreateParamsOutput} check output.
 */
function failedCheckOutput(
  approverTeams,
  otherBundleSizeDeltas,
  missingBundleSizes
) {
  return {
    title: `approval required from one of [@${approverTeams.join(', @')}]`,
    summary:
      'This pull request has increased the bundle size (brotli compressed ' +
      'size) of the following files, and must be approved by a member of one ' +
      `of the following teams: @${approverTeams.join(', @')}\n` +
      extraBundleSizesSummary(otherBundleSizeDeltas, missingBundleSizes) +
      '\n' +
      'A randomly selected member from one of the above teams will be added ' +
      'automatically to review this PR. Only once the member approves this ' +
      'PR, can it be merged. If you do not receive a response feel free to ' +
      'tag another team member.',
  };
}

/**
 * Returns an encouraging result summary when the bundle size is reduced.
 * Otherwise the summary is neutral, but not discouraging.
 *
 * @param {!Array<string>} otherBundleSizeDeltas text description of other
 *   bundle size changes.
 * @param {!Array<string>} missingBundleSizes text description of missing bundle
 *   sizes from other `master` or the pull request.
 * @return {!Octokit.ChecksCreateParamsOutput} check output.
 */
function successfulCheckOutput(otherBundleSizeDeltas, missingBundleSizes) {
  return {
    title: `no approval necessary`,
    summary:
      'This pull request does not change any bundle size (brotli compressed ' +
      'size) by any significant amount, so no special approval is necessary.' +
      extraBundleSizesSummary(otherBundleSizeDeltas, missingBundleSizes),
  };
}

/**
 * Returns a result summary to indicate that an error has occurred.
 *
 * @param {string} partialBaseSha the base sha this PR's commit is compared
 *   against.
 * @return {!Octokit.ChecksCreateParamsOutput} check output.
 */
function erroredCheckOutput(partialBaseSha) {
  const superUserTeams =
    '@' + process.env.SUPER_USER_TEAMS.replace(/,/g, ', @');
  return {
    title: `Failed to retrieve the bundle size of branch point ${partialBaseSha}`,
    summary:
      'The bundle size (brotli compressed size) of this pull request could ' +
      'not be determined because the base size (that is, the bundle sizes of ' +
      'the `master` commit that this pull request was compared against) was ' +
      'not found in the ' +
      '`https://github.com/ampproject/amphtml-build-artifacts` ' +
      'repository. This can happen due to failed or delayed Travis builds on ' +
      'said `master` commit.\n' +
      `A member of [${superUserTeams}] will be added automatically to review ` +
      'this PR. Only once the member approves this PR, can it be merged. If ' +
      'you do not receive a response feel free to tag another team member.',
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
    '## Bundle size changes\n' +
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

/**
 * Install the API router on the Probot application.
 *
 * @param {!Probot.Application} app Probot application.
 * @param {!Knex} db database connection.
 * @param {!GitHubUtils} githubUtils GitHubUtils instance.
 */
exports.installApiRouter = (app, db, githubUtils) => {
  /**
   * Add a bundle size reviewer to add to the pull request.
   *
   * Does nothing if there is already a reviewer that can approve the bundle
   * size change.
   *
   * @param {!Octokit} github an authenticated GitHub API object.
   * @param {!Octokit.PullsListReviewRequestsParams} pullRequest GitHub Pull
   *   Request params.
   * @param {!Array<string>} approverTeams list of all the teams whose members
   *   can approve the bundle-size change of this pull request.
   * @return {!Octokit.Response<Octokit.PullsCreateReviewRequestResponse>}
   *   response from GitHub API.
   */
  async function addReviewer_(github, pullRequest, approverTeams) {
    const newReviewer = await githubUtils.chooseReviewer(
      pullRequest,
      approverTeams
    );
    if (newReviewer !== null) {
      try {
        // Choose a random capable username and add them as a reviewer to the pull
        // request.
        return await github.pulls.createReviewRequest({
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
  }

  /**
   * Try to report the bundle size of a pull request to the GitHub check.
   *
   * @param {!object} check GitHub Check database object.
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
    const pullRequestOptions = {
      pull_number: check.pull_request_id,
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
      const fileNotFound = 'status' in error && error.status === 404;
      const partialHeadSha = check.head_sha.substr(0, 7);
      const partialBaseSha = baseSha.substr(0, 7);

      if (fileNotFound) {
        app.log.warn(
          `Bundle size of ${partialBaseSha} (PR #${check.pull_request_id}) ` +
            'does not exist yet'
        );
      } else {
        // Any error other than 404 NOT FOUND is unexpected, and should be
        // rethrown instead of attempting to re-retrieve the file.
        app.log.error(
          'Unexpected error when trying to retrieve the bundle size of ' +
            `${partialHeadSha} (PR #${check.pull_request_id}) with branch ` +
            `point ${partialBaseSha} from GitHub:]n`,
          error
        );
        throw error;
      }

      if (lastAttempt) {
        app.log.warn('No more retries left. Reporting failure');
        Object.assign(updatedCheckOptions, {
          conclusion: 'action_required',
          output: erroredCheckOutput(partialBaseSha),
        });
        await github.checks.update(updatedCheckOptions);
        await addReviewer_(
          github,
          pullRequestOptions,
          process.env.SUPER_USER_TEAMS.split(',')
        );
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

    const chosenApproverTeams = choosePotentialApproverTeams(
      Array.from(allPotentialApproverTeams).map(JSON.parse),
      app.log,
      check.pull_request_id
    );
    const requiresApproval = Boolean(chosenApproverTeams.length);

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

    if (requiresApproval) {
      await db('checks')
        .update({approving_teams: chosenApproverTeams.join(',')})
        .where({head_sha: check.head_sha});
      Object.assign(updatedCheckOptions, {
        conclusion: 'action_required',
        output: failedCheckOutput(
          chosenApproverTeams,
          bundleSizeDeltas,
          missingBundleSizes
        ),
      });
    } else {
      Object.assign(updatedCheckOptions, {
        conclusion: 'success',
        output: successfulCheckOutput(bundleSizeDeltas, missingBundleSizes),
      });
    }
    await github.checks.update(updatedCheckOptions);

    if (requiresApproval) {
      await addReviewer_(github, pullRequestOptions, chosenApproverTeams);
    }

    return true;
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
