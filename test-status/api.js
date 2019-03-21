/**
 * Copyright 2019, the AMP HTML authors
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

const {getCheckRunId, getPullRequestSnapshot} = require('./db');

/**
 * Create a parameters object for a new status check line.
 *
 * @param {string} pullRequestSnapshot pull request snapshot from database.
 * @param {string} type major tests type slug (e.g., unit, integration).
 * @param {string} subType sub tests type slug (e.g., saucelabs, single-pass).
 * @param {string} status status action.
 * @return {!Object} a parameters object for github.checks.create|update.
 */
function createNewCheckParams(pullRequestSnapshot, type, subType, status) {
  const params = {
    owner: pullRequestSnapshot.owner,
    repo: pullRequestSnapshot.repo,
    name: `ampproject/tests/${type} (${subType})`,
    head_sha: pullRequestSnapshot.head_sha,
  };
  switch (status) {
    case 'queued':
      Object.assign(params, {
        status: 'queued',
        output: {
          title: 'Tests are queued on Travis',
          summary: `The ${type} tests (${subType}) are queued to run on ` +
            'Travis. Watch this space for results in a few minutes!',
        },
      });
      break;

    case 'started':
      Object.assign(params, {
        status: 'in_progress',
        started_at: new Date().toISOString(),
        output: {
          title: 'Tests are running on Travis',
          summary: `The ${type} tests (${subType}) are running on Travis. ` +
          'Watch this space for results in a few minutes!',
        },
      });
      break;

    case 'skipped':
      Object.assign(params, {
        status: 'completed',
        conclusion: 'neutral',
        completed_at: new Date().toISOString(),
        output: {
          title: 'Tests were not required',
          summary: `The ${type} tests (${subType}) were not required to run ` +
            'for this pull request.',
        },
      });
      break;

    default:
      throw new Error(
          `'status' paramater is set to unexpected value ${status}`);
  }
  return params;
}

/**
 * Create a parameters object for reporting the results of the tests status to
 * an existing GitHub status check.
 *
 * @param {string} pullRequestSnapshot pull request snapshot from database.
 * @param {string} type major tests type slug (e.g., unit, integration).
 * @param {string} subType sub tests type slug (e.g., saucelabs, single-pass).
 * @param {number} checkRunId the existing check run ID.
 * @param {number} passed number of tests that passed.
 * @param {number} failed number of tests that failed.
 * @return {!Object} a parameters object for github.checks.update.
 */
function createReportedCheckParams(
  pullRequestSnapshot, type, subType, checkRunId, passed, failed) {
  const {owner, repo, head_sha: headSha} = pullRequestSnapshot;
  const params = {
    owner,
    repo,
    check_run_id: checkRunId,
    status: 'completed',
    completed_at: new Date().toISOString(),
  };
  if (failed > 0) {
    const detailsUrl = new URL(
        `/tests/${headSha}/${type}/${subType}/status`,
        process.env.WEB_UI_BASE_URL);
    Object.assign(params, {
      details_url: detailsUrl.href,
      conclusion: 'action_required',
      output: {
        title: `${failed} test${failed != 1 ? 's' : ''} failed`,
        summary: `The ${type} tests (${subType}) finished running on Travis.`,
        text: `* *${passed}* test${passed != 1 ? 's' : ''} PASSED\n` +
          `* *${failed}* test${failed != 1 ? 's' : ''} FAILED\n\n` +
          'Please inspect the Travis build and fix any code changes that ' +
          'resulted in test breakage or fix the broken tests.\n\n' +
          'If you believe that this pull request was not the cause of this ' +
          'test breakage (i.e., this is a flaky test) please contact the ' +
          // TODO(danielrozenberg): say who the weekly build cop is inline here:
          'weekly build cop, who can advise on how to proceed, or skip this ' +
          'test run for you.',
      },
    });
  } else {
    Object.assign(params, {
      conclusion: 'success',
      output: {
        title: `${passed} test${passed != 1 ? 's' : ''} passed`,
        summary: `The ${type} tests (${subType}) finished running on Travis.`,
        text: `* *${passed}* test${passed != 1 ? 's' : ''} PASSED`,
      },
    });
  }
  return params;
}

/**
 * Create a parameters object for reporting an errored test to an existing
 * GitHub status check.
 *
 * @param {string} pullRequestSnapshot pull request snapshot from database.
 * @param {string} type major tests type slug (e.g., unit, integration).
 * @param {string} subType sub tests type slug (e.g., saucelabs, single-pass).
 * @param {number} checkRunId the existing check run ID.
 * @return {!Object} a parameters object for github.checks.update.
 */
function createErroredCheckParams(
  pullRequestSnapshot, type, subType, checkRunId) {
  const {owner, repo, head_sha: headSha} = pullRequestSnapshot;
  const detailsUrl = new URL(`/tests/${headSha}/${type}/${subType}/status`,
      process.env.WEB_UI_BASE_URL);
  return {
    owner,
    repo,
    check_run_id: checkRunId,
    status: 'completed',
    completed_at: new Date().toISOString(),
    details_url: detailsUrl.href,
    conclusion: 'action_required',
    output: {
      title: `Tests have errored`,
      summary: `An unexpected error occurred while running ${type} ` +
        `tests (${subType}).`,
      text: 'Please inspect the Travis build for the details.\n\n' +
        'If you believe that this pull request was not the cause of this ' +
        // TODO(danielrozenberg): say who the weekly build cop is inline here:
        'error, please contact the weekly build cop, who can advise on how ' +
        'to proceed, or skip this test run for you.',
    },
  };
}

exports.installApiRouter = (app, db) => {
  const v0 = app.route('/v0');
  v0.use((request, response, next) => {
    request.app.set('trust proxy', true);
    if ('TRAVIS_IP_ADDRESSES' in process.env &&
      !process.env.TRAVIS_IP_ADDRESSES.includes(request.ip)) {
      app.log(`Refused a request to ${request.originalUrl} from ${request.ip}`);
      response.status(403).end('You are not Travis!');
    } else {
      next();
    }
  });

  v0.post('/tests/:headSha/:type/:subType/:status(queued|started|skipped)',
      async (request, response) => {
        const {headSha, type, subType, status} = request.params;
        app.log(
            `Creating/updating a new GitHub check for the ${type} ` +
            `tests (${subType}) for pull request with head commit SHA ` +
            `${headSha}, with a status of '${status}'`);

        const pullRequestSnapshot = await getPullRequestSnapshot(db, headSha);
        if (pullRequestSnapshot === undefined) {
          return response.status(404).end(`${headSha} not in database`);
        }

        // Get the existing check run ID, or `undefined` if this is the first
        // time this head SHA is reported for this test type.
        const checkRunId = await getCheckRunId(db, headSha, type, subType);

        let params;
        try {
          params = createNewCheckParams(
              pullRequestSnapshot, type, subType, status);
        } catch (error) {
          app.log(`ERROR: ${error}`);
          return response.status(400).end(error);
        }

        const github = await app.auth(pullRequestSnapshot.installation_id);
        if (checkRunId === null) {
          const check = await github.checks.create(params);
          await db('checks').insert({
            head_sha: headSha,
            type: type,
            subType,
            check_run_id: check.data.id,
          });
        } else {
          await github.checks.update(Object.assign(params, {
            check_run_id: checkRunId,
          }));
        }

        return response.end();
      });

  v0.post('/tests/:headSha/:type/:subType/report/:passed/:failed',
      async (request, response) => {
        const {headSha, type, subType, passed, failed} = request.params;
        app.log(
            `Reporting the results of the ${type} tests (${subType}) to the ` +
            `GitHub check for pull request with head commit SHA ${headSha}`);
        app.log(`Passed: ${passed} | Failed: ${failed}`);

        const pullRequestSnapshot = await getPullRequestSnapshot(db, headSha);
        const checkRunId = await getCheckRunId(db, headSha, type, subType);
        if (pullRequestSnapshot === undefined || checkRunId === null) {
          return response.status(404).end(
              'No existing status check was found for ' +
              `${headSha}/${type}/${subType}`);
        }

        const params = createReportedCheckParams(
            pullRequestSnapshot, type, subType, checkRunId, passed, failed);
        const github = await app.auth(pullRequestSnapshot.installation_id);
        await github.checks.update(params);

        await db('checks')
            .update({passed, failed, errored: false})
            .where({head_sha: headSha, type, subType});

        return response.end();
      });

  v0.post('/tests/:headSha/:type/:subType/report/errored',
      async (request, response) => {
        const {headSha, type, subType} = request.params;
        app.log(
            `Reporting that ${type} tests (${subType}) have errored to the ` +
            `GitHub check for pull request with head commit SHA ${headSha}`);

        const pullRequestSnapshot = await getPullRequestSnapshot(db, headSha);
        const checkRunId = await getCheckRunId(db, headSha, type, subType);
        if (pullRequestSnapshot === undefined || checkRunId === null) {
          return response.status(404).end(
              'No existing status check was found for ' +
              `${headSha}/${type}/${subType}`);
        }

        const params = createErroredCheckParams(
            pullRequestSnapshot, type, subType, checkRunId);
        const github = await app.auth(pullRequestSnapshot.installation_id);
        await github.checks.update(params);

        await db('checks')
            .update({passed: null, failed: null, errored: true})
            .where({head_sha: headSha, type, subType});

        return response.end();
      });
};
