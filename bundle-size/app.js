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

const {dbConnect} = require('./db');
const Octokit = require('@octokit/rest');
const path = require('path');
const sleep = require('sleep-promise');

const RETRY_MILLIS = 60000;
const RETRY_TIMES = 60;

const HUMAN_ENCOURAGEMENT_MAX_DELTA = -0.03;

const db = dbConnect();

/**
 * Get GitHub API parameters for bundle-size file actions.
 *
 * @param {string} filename the name of the file to act on.
 * @return {!object} GitHub API parameters to act on the file.
 */
function getBuildArtifactsFileParams(filename) {
  return {
    owner: 'ampproject',
    repo: 'amphtml-build-artifacts',
    path: path.join('bundle-size', filename),
  };
}

/**
 * Get a file from the bundle-size directory in the AMPHTML build artifacts
 * repository.
 *
 * @param {!github} github an authenticated GitHub API object.
 * @param {string} filename the name of the file to retrieve.
 * @return {string} the text contents of the file.
 */
async function getBuildArtifactsFile(github, filename) {
  return await github.repos
    .getContents(getBuildArtifactsFileParams(filename))
    .then(result => {
      return Buffer.from(result.data.content, 'base64').toString();
    });
}

/**
 * Store a file in the bundle-size directory in the AMPHTML build artifacts
 * repository.
 *
 * @param {!github} github an authenticated GitHub API object.
 * @param {string} filename the name of the file to store into.
 * @param {string} contents text contents of the file.
 * @return {object} to ignore.
 */
async function storeBuildArtifactsFile(github, filename, contents) {
  return await github.repos.createOrUpdateFile({
    ...getBuildArtifactsFileParams(filename),
    message: `bundle-size: ${filename}`,
    content: Buffer.from(contents).toString('base64'),
  });
}

/**
 * Check whether the user is allowed to approve a bundle size change.
 *
 * @param {!github} github an authorized GitHub API object.
 * @param {string} username the username to check.
 * @return {boolean} true if the user is allowed to approve bundle size changes.
 */
async function isBundleSizeApprover(github, username) {
  // TODO(danielrozenberg): replace this logic with Promise.any when it exists.
  for (const teamId of process.env.APPROVER_TEAMS.split(',')) {
    try {
      await github.teams.getMembership({
        team_id: parseInt(teamId, 10),
        username,
      });
      return true;
    } catch (error) {
      // Ignore...
    }
  }
  return false;
}

/**
 * Get a random reviewer from the approved teams.
 *
 * @param {!github} github an authorized GitHub API object.
 * @return {string} a username of someone who can approve a bundle size change.
 */
async function getRandomReviewer(github) {
  const reviewerTeamIds = process.env.REVIEWER_TEAMS.split('‚');
  const reviewerTeamId = parseInt(
    reviewerTeamIds[Math.floor(Math.random() * reviewerTeamIds.length)],
    10
  );

  const members = await github.teams
    .listMembers({
      team_id: reviewerTeamId,
    })
    .then(response => response.data);
  const member = members[Math.floor(Math.random() * members.length)];
  return member.login;
}

/**
 * Format the bundle size delta in "Δ 99.99KB" format.
 *
 * Always fixed with 2 digits after the dot, preceded with a plus or minus sign.
 *
 * @param {number} delta the bundle size delta.
 * @return {string} formatted bundle size delta.
 */
function formatBundleSizeDelta(delta) {
  return 'Δ ' + (delta >= 0 ? '+' : '') + delta.toFixed(2) + 'KB';
}

/**
 * Returns an encouraging result summary when the bundle size is reduced.
 * Otherwise the summary is neutral, but not discouraging.
 *
 * @param {number} delta bundle size delta.
 * @param {string} deltaFormatted bundle size delta from `formatBundleSizeDelta`
 * @return {string} successful summary message.
 */
function successfulSummaryMessage(delta, deltaFormatted) {
  if (delta <= HUMAN_ENCOURAGEMENT_MAX_DELTA) {
    return (
      'This pull request *reduces* the bundle size ' +
      '(brotli compressed size of `v0.js`), so no special approval is ' +
      `necessary. The bundle size change is ${deltaFormatted}.`
    );
  }

  return (
    'This pull request does not change the bundle size ' +
    '(brotli compressed size of `v0.js`) by any significant amount, so no ' +
    'special approval is necessary. ' +
    `The bundle size change is ${deltaFormatted}.`
  );
}

module.exports = app => {
  const userBasedGithub = new Octokit({
    'auth': process.env.ACCESS_TOKEN,
  });

  /**
   * Get the GitHub Check object from the database.
   *
   * @param {string} headSha commit SHA of the head commit of a pull request.
   * @return {!object} GitHub Check object.
   */
  async function getCheckFromDatabase(headSha) {
    const results = await db('checks')
      .select(
        'head_sha',
        'pull_request_id',
        'installation_id',
        'owner',
        'repo',
        'check_run_id',
        'delta'
      )
      .where('head_sha', headSha);
    if (results.length > 0) {
      return results[0];
    } else {
      return null;
    }
  }

  /**
   * Try to report the bundle size of a pull request to the GitHub check.
   *
   * @param {!object} check GitHub Check object.
   * @param {string} baseSha commit SHA of the base commit being compared to.
   * @param {number} bundleSize the total bundle size in KB.
   * @param {boolean} lastAttempt true if this is the last retry.
   * @return {boolean} true if succeeded; false otherwise.
   */
  async function tryReport(check, baseSha, bundleSize, lastAttempt = false) {
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

    try {
      const bundleSizesJson = JSON.parse(
        await getBuildArtifactsFile(github, `${baseSha}.json`)
      );
      const baseBundleSize = bundleSizesJson['dist/v0.js'];

      const bundleSizeDelta = bundleSize - baseBundleSize;
      const bundleSizeDeltaFormatted = formatBundleSizeDelta(bundleSizeDelta);

      await db('checks')
        .update({delta: bundleSizeDelta})
        .where({head_sha: check.head_sha});

      const requiresApproval =
        bundleSizeDelta > process.env['MAX_ALLOWED_INCREASE'];
      if (requiresApproval) {
        Object.assign(updatedCheckOptions, {
          conclusion: 'action_required',
          output: {
            title: `${bundleSizeDeltaFormatted} | approval required`,
            summary:
              'This pull request has increased the bundle size ' +
              '(brotli compressed size of `v0.js`) by ' +
              `${bundleSizeDeltaFormatted}. As part of an ongoing effort to ` +
              'reduce the bundle size, this change requires special approval.' +
              '\n' +
              'A member of the bundle-size group will be added automatically ' +
              'to review this PR. Only once the member approves this PR, ' +
              'can it be merged. If you do not receive a response from the ' +
              'group member, feel free to tag another person in ' +
              process.env.REVIEWER_TEAM_NAMES,
          },
        });
      } else {
        const title = `${bundleSizeDeltaFormatted} | no approval necessary`;
        const summary = successfulSummaryMessage(
          bundleSizeDelta,
          bundleSizeDeltaFormatted
        );
        Object.assign(updatedCheckOptions, {
          conclusion: 'success',
          output: {title, summary},
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
    } catch (error) {
      const partialHeadSha = check.head_sha.substr(0, 7);
      const partialBaseSha = baseSha.substr(0, 7);
      app.log.error(
        'ERROR: Failed to retrieve the bundle size of ' +
          `${partialHeadSha} (PR #${check.pull_request_id}) with branch ` +
          `point ${partialBaseSha} from GitHub: ${error}`
      );
      if (lastAttempt) {
        app.log.warn('No more retries left. Reporting failure');
        Object.assign(updatedCheckOptions, {
          conclusion: 'action_required',
          output: {
            title:
              'Failed to retrieve the bundle size of branch point ' +
              partialBaseSha,
            summary:
              'The bundle size (brotli compressed size of `v0.js`) ' +
              'of this pull request could not be determined because the base ' +
              'size (that is, the bundle size of the `master` commit that ' +
              'this pull request was compared against) was not found in the ' +
              '`https://github.com/ampproject/amphtml-build-artifacts` ' +
              'repository. This can happen due to failed or delayed Travis ' +
              'builds on said `master` commit.\n' +
              'A member of the bundle-size group will be added automatically ' +
              'to review this PR. Only once the member approves this PR, ' +
              'can it be merged. If you do not receive a response from the ' +
              'group member, feel free to tag another person in ' +
              process.env.REVIEWER_TEAM_NAMES,
          },
        });
        await github.checks.update(updatedCheckOptions);
        await addBundleSizeReviewer(github, {
          pull_number: check.pull_request_id,
          ...githubOptions,
        });
      }
      return false;
    }
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
      const newReviewer = await getRandomReviewer(userBasedGithub);
      return await github.pullRequests.createReviewRequest({
        reviewers: [newReviewer],
        ...pullRequest,
      });
    } catch (error) {
      app.log.error(
        'ERROR: Failed to add a reviewer to pull request ' +
          `${pullRequest.pull_number}. Skipping...`
      );
      app.log.error(`Error message: ${error}`);
      throw error;
    }
  }

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

    if (
      context.payload.review.state == 'approved' &&
      (await isBundleSizeApprover(userBasedGithub, approver))
    ) {
      context.log(
        `Pull request ${pullRequestId} approved by a bundle-size keeper`
      );

      const check = await getCheckFromDatabase(headSha);
      if (!check) {
        context.log(
          `Check ID for pull request ${pullRequestId} with head ` +
            `SHA ${headSha} was not found in the database`
        );
        return;
      }

      let approvalMessagePrefix;
      if (check.delta === null) {
        approvalMessagePrefix = 'Δ ±?.??KB';
      } else {
        const bundleSizeDelta = parseFloat(check.delta);
        if (bundleSizeDelta <= process.env['MAX_ALLOWED_INCREASE']) {
          return;
        }
        approvalMessagePrefix = formatBundleSizeDelta(bundleSizeDelta);
      }

      await context.github.checks.update({
        owner: check.owner,
        repo: check.repo,
        check_run_id: check.check_run_id,
        conclusion: 'success',
        completed_at: new Date().toISOString(),
        output: {
          title: `${approvalMessagePrefix} | approved by @${approver}`,
          summary:
            'The bundle size (brotli compressed size of `v0.js`) ' +
            `of this pull request was approved by ${approver}`,
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

    const check = await getCheckFromDatabase(headSha);
    if (!check) {
      return response.status(404).end(`${headSha} not in database`);
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
    // TODO(#142): restore the default bundleSize field name here once the
    // ampproject/amphtml runner starts reporting Brotli sizes in the bundleSize
    // field.
    const {baseSha, brotliBundleSize: bundleSize} = request.body;

    if (typeof baseSha !== 'string' || !/^[0-9a-f]{40}$/.test(baseSha)) {
      return response
        .status(400)
        .end('POST request to /report must have commit SHA field "baseSha"');
    }
    if (typeof bundleSize !== 'number') {
      return response
        .status(400)
        .end(
          'POST request to /report must have numeric field "brotliBundleSize"'
        );
    }

    const check = await getCheckFromDatabase(headSha);
    if (!check) {
      return response.status(404).end(`${headSha} not in database`);
    }

    let reportSuccess = await tryReport(check, baseSha, bundleSize);
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
          bundleSize,
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
      await getBuildArtifactsFile(userBasedGithub, jsonBundleSizeFile);
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
      await storeBuildArtifactsFile(
        userBasedGithub,
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
        'in the build artifacts repository on GitHub!\n' +
        `Error message was: ${error}`;
      app.log.error(errorMessage);
      return response.status(500).end(errorMessage);
    }

    response.end();
  });
};
