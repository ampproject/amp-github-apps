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

const RETRY_MILLIS = 60000;
const RETRY_TIMES = 60;

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
 * Format the bundle size delta in "Δ 99.99KB" format.
 *
 * Always fixed with 2 digits after the dot. Adds a minus (-) sign for negative
 * numbers, but no plus (+) sign for positive.
 *
 * @param {number} delta the bundle size delta.
 * @return {string} formatted bundle size delta.
 */
function formatBundleSizeDelta(delta) {
  return 'Δ ' + (delta >= 0 ? '+' : '') + delta.toFixed(2) + 'KB';
}

module.exports = app => {
  const db = dbConnect();

  /**
   * Get the GitHub Check object from the database.
   *
   * @param {string} headSha commit SHA of the head commit of a pull request.
   * @return {!Object} GitHub Check object.
   */
  async function getCheckFromDatabase(headSha) {
    const results = await db('checks')
        .select('head_sha', 'base_sha', 'pull_request_id', 'installation_id',
            'owner', 'repo', 'check_run_id', 'delta')
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
   * @param {number} retriesLeft number of times to retry the report.
   * @param {!Object} check GitHub Check object.
   * @param {number} bundleSize the total bundle size in KB.
   * @return {boolean} true if succeeded; false otherwise.
   */
  async function tryReport(retriesLeft, check, bundleSize) {
    const github = await app.auth(check.installation_id);
    const updatedCheckOptions = {
      owner: check.owner,
      repo: check.repo,
      check_run_id: check.check_run_id,
      name: 'ampproject/bundle-size',
      completed_at: new Date().toISOString(),
    };

    try {
      const baseBundleSize = parseFloat(
          await getBuildArtifactsFile(github, check.base_sha));
      const bundleSizeDelta = bundleSize - baseBundleSize;
      const bundleSizeDeltaFormatted = formatBundleSizeDelta(bundleSizeDelta);

      await db('checks')
          .update({delta: bundleSizeDelta})
          .where({head_sha: check.head_sha});

      if (bundleSizeDelta > process.env['MAX_ALLOWED_INCREASE']) {
        Object.assign(updatedCheckOptions, {
          conclusion: 'action_required',
          output: {
            title: `${bundleSizeDeltaFormatted} | approval required`,
            summary: `${bundleSizeDeltaFormatted} | approval required`,
          },
        });
      } else {
        Object.assign(updatedCheckOptions, {
          conclusion: 'success',
          output: {
            title: `${bundleSizeDeltaFormatted} | no approval necessary`,
            summary: `${bundleSizeDeltaFormatted} | no approval necessary`,
          },
        });
      }
      await github.checks.update(updatedCheckOptions);
      return true;
    } catch (error) {
      const partialHeadSha = check.head_sha.substr(0, 7);
      const partialBaseSha = check.base_sha.substr(0, 7);
      app.log('ERROR: Failed to retrieve the bundle size of ' +
              `${partialHeadSha} (PR #${check.pull_request_id}) with branch ` +
              `point ${partialBaseSha} from GitHub: ${error}`);
      if (retriesLeft > 0) {
        app.log(`Will retry ${retriesLeft} more time(s) in ${RETRY_MILLIS} ms`);
        setTimeout(tryReport, RETRY_MILLIS, retriesLeft - 1, check, bundleSize);
      } else {
        app.log('No more retries left. Reporting failure');
        Object.assign(updatedCheckOptions, {
          conclusion: 'action_required',
          output: {
            title: 'Failed to retrieve the bundle size of branch point ' +
                partialBaseSha,
            summary: 'bundle size check skipped for this PR. A member of the ' +
                'bundle-size squad must approve this PR manually.',
          },
        });
        await github.checks.update(updatedCheckOptions);
      }
      return false;
    }
  }

  app.on(['pull_request.opened', 'pull_request.synchronize'], async context => {
    context.log(`Pull request ${context.payload.number} created/updated`);

    const params = context.repo({
      name: 'ampproject/bundle-size',
      head_sha: context.payload.pull_request.head.sha,
      output: {
        title: 'Calculating new bundle size for this PR…',
        summary: 'Calculating new bundle size for this PR…',
      },
    });
    const check = await context.github.checks.create(params);
    await db('checks')
        .insert({
          head_sha: context.payload.pull_request.head.sha,
          base_sha: context.payload.pull_request.base.sha,
          pull_request_id: context.payload.number,
          installation_id: context.payload.installation.id,
          owner: params.owner,
          repo: params.repo,
          check_run_id: check.data.id,
        });
  });

  app.on('pull_request_review.submitted', async context => {
    const approver = context.payload.review.user.login;
    const owners = (await getBuildArtifactsFile(context.github, 'OWNERS'))
        .trim().split('\n').filter(line => !line.startsWith('#'));

    if (context.payload.review.state == 'approved' &&
        owners.includes(approver)) {
      context.log(`Pull request ${context.payload.pull_request.number} ` +
          'approved by a bundle-size keeper');

      const check = await getCheckFromDatabase(
          context.payload.pull_request.head.sha);
      if (!check || check.delta === null) {
        return;
      }

      const bundleSizeDelta = parseFloat(check.delta);
      if (bundleSizeDelta <= process.env['MAX_ALLOWED_INCREASE']) {
        return;
      }

      const bundleSizeDeltaFormatted = formatBundleSizeDelta(bundleSizeDelta);
      await context.github.checks.update({
        owner: check.owner,
        repo: check.repo,
        check_run_id: check.check_run_id,
        conclusion: 'success',
        completed_at: new Date().toISOString(),
        output: {
          title: `${bundleSizeDeltaFormatted} | approved by @${approver}`,
          summary: `${bundleSizeDeltaFormatted} | approved by @${approver}`,
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
        title: 'bundle size check skipped for this PR',
        summary: 'bundle size check skipped for this PR',
      },
    });
    response.end();
  });

  v0.post('/commit/:headSha/report', async (request, response) => {
    if (!('bundleSize' in request.body) ||
        typeof request.body.bundleSize != 'number') {
      return response.status(400).end(
          'POST request to /report must have numeric field "bundleSize"');
    }
    const {headSha} = request.params;
    const {bundleSize} = request.body;

    const check = await getCheckFromDatabase(headSha);
    if (!check) {
      return response.status(404).end(`${headSha} not in database`);
    }

    if (await tryReport(RETRY_TIMES, check, bundleSize)) {
      response.end();
    } else {
      response.status(202).end();
    }
  });
};
