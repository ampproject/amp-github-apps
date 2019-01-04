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
const path = require('path');
const sleep = require('sleep-promise');

const RETRY_MILLIS = 60000;
const RETRY_TIMES = 60;

const db = dbConnect();

/**
 * Get a file from the bundle-size directory in the AMPHTML build artifacts
 * repository.
 *
 * @param {github} github an authenticated GitHub API object.
 * @param {string} filename the name of the file to retrieve.
 * @throws {Error} on any error.
 * @return {string} the text contents of the file.
 */
async function getBuildArtifactsFile(github, filename) {
  return await github.repos.getContents({
    owner: 'ampproject',
    repo: 'amphtml-build-artifacts',
    path: path.join('bundle-size', filename),
  }).then(result => {
    return Buffer.from(result.data.content, 'base64').toString();
  });
}

/**
 * Get the list of OWNERS that can approve this PR.
 *
 * @param {github} github an authorized GitHub API object.
 * @throws {Error} on any error.
 * @return {!Array<string>} an array of OWNERS GitHub usernames.
 */
async function getOwners(github) {
  return (await getBuildArtifactsFile(github, 'OWNERS'))
      .trim()
      .split('\n')
      .filter(line => !!line && !line.startsWith('#'));
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

module.exports = app => {
  /**
   * Get the GitHub Check object from the database.
   *
   * @param {string} headSha commit SHA of the head commit of a pull request.
   * @return {!Object} GitHub Check object.
   */
  async function getCheckFromDatabase(headSha) {
    const results = await db('checks')
        .select('head_sha', 'pull_request_id', 'installation_id', 'owner',
            'repo', 'check_run_id', 'delta')
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
   * @param {!Object} check GitHub Check object.
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
    const updatedCheckOptions = Object.assign({
      check_run_id: check.check_run_id,
      name: 'ampproject/bundle-size',
      completed_at: new Date().toISOString(),
    }, githubOptions);

    try {
      const baseBundleSize = parseFloat(
          await getBuildArtifactsFile(github, baseSha));
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
            summary: 'This pull request has increased the bundle size ' +
              '(gzipped compressed size of `v0.js`) by ' +
              `${bundleSizeDeltaFormatted}. As part of an ongoing effort to ` +
              'reduce the bundle size, this change requires special approval.' +
              '\n' +
              'A member of the bundle-size group will be added automatically ' +
              'to review this PR. Only once the member approves this PR, ' +
              'can it be merged. If you do not receive a response from the ' +
              'group member, feel free to tag another person listed in the ' +
              'bundle-size [OWNERS](https://github.com/ampproject/' +
              'amphtml-build-artifacts/blob/master/bundle-size/OWNERS) file.',
          },
        });
      } else {
        Object.assign(updatedCheckOptions, {
          conclusion: 'success',
          output: {
            title: `${bundleSizeDeltaFormatted} | no approval necessary`,
            summary: 'This pull request does not increase the bundle size ' +
              '(gzipped compressed size of `v0.js`) by any significant ' +
              'amount, so no special approval is necessary. The bundle size ' +
              `change is ${bundleSizeDeltaFormatted}`,
          },
        });
      }
      await github.checks.update(updatedCheckOptions);

      if (requiresApproval) {
        await addOwnersReviewer(github,
            Object.assign({number: check.pull_request_id}, githubOptions));
      }

      return true;
    } catch (error) {
      const partialHeadSha = check.head_sha.substr(0, 7);
      const partialBaseSha = baseSha.substr(0, 7);
      app.log('ERROR: Failed to retrieve the bundle size of ' +
              `${partialHeadSha} (PR #${check.pull_request_id}) with branch ` +
              `point ${partialBaseSha} from GitHub: ${error}`);
      if (lastAttempt) {
        app.log('No more retries left. Reporting failure');
        Object.assign(updatedCheckOptions, {
          conclusion: 'action_required',
          output: {
            title: 'Failed to retrieve the bundle size of branch point ' +
                partialBaseSha,
            summary: 'The bundle size (gzipped compressed size of `v0.js`) ' +
              'of this pull request could not be determined because the base ' +
              'size (that is, the bundle size of the `master` commit that ' +
              'this pull request was compared against) was not found in the ' +
              '`https://github.com/ampproject/amphtml-build-artifacts` ' +
              'repository. This can happen due to failed or delayed Travis ' +
              'builds on said `master` commit.\n' +
              'A member of the bundle-size group will be added automatically ' +
              'to review this PR. Only once the member approves this PR, ' +
              'can it be merged. If you do not receive a response from the ' +
              'group member, feel free to tag another person listed in the ' +
              'bundle-size [OWNERS](https://github.com/ampproject/' +
              'amphtml-build-artifacts/blob/master/bundle-size/OWNERS) file.',
          },
        });
        await github.checks.update(updatedCheckOptions);
        await addOwnersReviewer(github,
            Object.assign({number: check.pull_request_id}, githubOptions));
      }
      return false;
    }
  }

  /**
   * Add an OWNERS reviewer to the pull request.
   *
   * Ignore errors as this is a non-critical action.
   *
   * @param {github} github an authenticated GitHub API object.
   * @param {!Object} pullRequest GitHub Pull Request object.
   */
  async function addOwnersReviewer(github, pullRequest) {
    try {
      const owners = await getOwners(github);
      const reviewersResponse = await github.pullRequests.listReviewRequests(
          pullRequest);
      const reviewers = new Set(
          reviewersResponse.data.users.map(user => user.login));
      if (owners.some(owner => reviewers.has(owner))) {
        app.log(`INFO: Pull request ${pullRequest.number} already has an ` +
                'OWNERS reviewer. Skipping...');
        return;
      }

      // Choose a random OWNERS user and add them as a reviewer to the pull
      // request.
      const newReviewer = owners[Math.floor(Math.random() * owners.length)];
      return await github.pullRequests.createReviewRequest(Object.assign({
        reviewers: [newReviewer],
      }, pullRequest));
    } catch (error) {
      app.log('ERROR: Failed to add a reviewer to pull request ' +
              `${pullRequest.number}. Skipping...`);
      app.log(`Error message: ${error}`);
    }
  }

  app.on(['pull_request.opened', 'pull_request.synchronize'], async context => {
    context.log(`Pull request ${context.payload.number} created/updated`);

    const params = context.repo({
      name: 'ampproject/bundle-size',
      head_sha: context.payload.pull_request.head.sha,
      output: {
        title: 'Calculating new bundle size for this PR…',
        summary: 'The bundle size (gzipped compressed size of `v0.js`) ' +
          'of this pull request is being calculated on the ' +
          '`integration_tests` shard of the Travis build.',
      },
    });
    const check = await context.github.checks.create(params);
    await db('checks')
        .insert({
          head_sha: context.payload.pull_request.head.sha,
          pull_request_id: context.payload.number,
          installation_id: context.payload.installation.id,
          owner: params.owner,
          repo: params.repo,
          check_run_id: check.data.id,
        });
  });

  app.on('pull_request_review.submitted', async context => {
    const approver = context.payload.review.user.login;
    const owners = await getOwners(context.github);
    const pullRequestId = context.payload.pull_request.number;
    const headSha = context.payload.pull_request.head.sha;

    if (context.payload.review.state == 'approved' &&
        owners.includes(approver)) {
      context.log(`Pull request ${pullRequestId} approved by a bundle-size ` +
          'keeper');

      const check = await getCheckFromDatabase(headSha);
      if (!check) {
        context.log(`Check ID for pull request ${pullRequestId} with head ` +
            `SHA ${headSha} was not found in the database`);
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
          summary: 'The bundle size (gzipped compressed size of `v0.js`) ' +
            `of this pull request was approved by ${approver}`,
        },
      });
    }
  });

  const v0 = app.route('/v0');
  v0.use((request, response, next) => {
    request.app.set('trust proxy', true);
    if ('TRAVIS_IP_ADDRESSES' in process.env &&
        !process.env['TRAVIS_IP_ADDRESSES'].includes(request.ip)) {
      app.log(`Refused a request to ${request.originalUrl} from ${request.ip}`);
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
        summary: 'An automated check has determined that the bundle size ' +
          '(gzipped compressed size of `v0.js`) could not be affected by ' +
          'the files that this pull request modifies, so this check was ' +
          'marked as skipped.',
      },
    });
    response.end();
  });

  v0.post('/commit/:headSha/report', async (request, response) => {
    if (!('baseSha' in request.body) ||
        typeof request.body.baseSha != 'string' ||
        !/^[0-9a-f]{40}$/.test(request.body.baseSha)) {
      return response.status(400).end(
          'POST request to /report must have commit SHA field "baseSha"');
    }
    if (!('bundleSize' in request.body) ||
        typeof request.body.bundleSize != 'number') {
      return response.status(400).end(
          'POST request to /report must have numeric field "bundleSize"');
    }
    const {headSha} = request.params;
    const {baseSha, bundleSize} = request.body;

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
            check, baseSha, bundleSize, /* lastAttempt */ retriesLeft == 0);
      } while (retriesLeft > 0 && !reportSuccess);
    }
  });
};
