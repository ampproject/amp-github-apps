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

const {getBuildCop, getCheckRunId, getPullRequestSnapshot} = require('./db');

/**
 * Create a parameters object for a new status check line.
 *
 * @param {string} pullRequestSnapshot pull request snapshot from database.
 * @param {string} type major tests type slug (e.g., unit, integration).
 * @param {string} subType sub tests type slug (e.g., saucelabs, single-pass).
 * @param {string} status status action.
 * @return {!object} a parameters object for github.checks.create|update.
 */
function createNewCheckParams(pullRequestSnapshot, type, subType, status) {
  const params = {
    owner: pullRequestSnapshot.owner,
    repo: pullRequestSnapshot.repo,
    name: `ampproject/tests/${type} (${subType})`,
    head_sha: pullRequestSnapshot.headSha,
  };
  switch (status) {
    case 'queued':
      Object.assign(params, {
        status: 'queued',
        output: {
          title: 'Tests are queued on Travis',
          summary:
            `The ${type} tests (${subType}) are queued to run on ` +
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
          summary:
            `The ${type} tests (${subType}) are running on Travis. ` +
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
          summary:
            `The ${type} tests (${subType}) were not required to run ` +
            'for this pull request.',
        },
      });
      break;

    default:
      throw new Error(
        `'status' paramater is set to unexpected value ${status}`
      );
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
 * @param {string} buildCop the GitHub username of the current build cop.
 * @param {string?} travisJobUrl optional Travis job URL.
 * @return {!object} a parameters object for github.checks.update.
 */
function createReportedCheckParams(
  pullRequestSnapshot,
  type,
  subType,
  checkRunId,
  passed,
  failed,
  buildCop,
  travisJobUrl
) {
  const {owner, repo, headSha} = pullRequestSnapshot;
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
      process.env.WEB_UI_BASE_URL
    );
    Object.assign(params, {
      details_url: detailsUrl.href,
      conclusion: 'action_required',
      output: {
        title: `${failed} test${failed != 1 ? 's' : ''} failed`,
        summary: `The ${type} tests (${subType}) finished running on Travis.`,
        text:
          `* *${passed}* test${passed != 1 ? 's' : ''} PASSED\n` +
          `* *${failed}* test${failed != 1 ? 's' : ''} FAILED\n\n` +
          'Please inspect the Travis build and fix any code changes that ' +
          'resulted in test breakage or fix the broken tests.\n\n' +
          'If you believe that this pull request was not the cause of this ' +
          'test breakage (i.e., this is a flaky test) error please try the ' +
          'following steps:\n' +
          '1. Restart the failed ' +
          (travisJobUrl ? `[Travis job](${travisJobUrl})\n` : 'Travis job\n') +
          '2. Rebase your pull request on the latest `master` branch\n' +
          `3. Contact the weekly build cop (@${buildCop}), who can advise ` +
          'you how to proceed, or skip this test run for you.',
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
 * @param {string} buildCop the GitHub username of the current build cop.
 * @param {string?} travisJobUrl optional Travis job URL.
 * @return {!object} a parameters object for github.checks.update.
 */
function createErroredCheckParams(
  pullRequestSnapshot,
  type,
  subType,
  checkRunId,
  buildCop,
  travisJobUrl
) {
  const {owner, repo, headSha} = pullRequestSnapshot;
  const detailsUrl = new URL(
    `/tests/${headSha}/${type}/${subType}/status`,
    process.env.WEB_UI_BASE_URL
  );
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
      summary:
        `An unexpected error occurred while running ${type} ` +
        `tests (${subType}).`,
      text:
        'Please inspect the Travis build for the details.\n\n' +
        'If you believe that this pull request was not the cause of this ' +
        'error, please try the following steps:\n' +
        '1. Restart the failed ' +
        (travisJobUrl ? `[Travis job](${travisJobUrl})\n` : 'Travis job\n') +
        '2. Rebase your pull request on the latest `master` branch\n' +
        `3. Contact the weekly build cop (@${buildCop}), who can advise you ` +
        'how to proceed, or skip this test run for you.',
    },
  };
}

exports.installApiRouter = (app, db) => {
  const tests = app.route('/v0/tests');
  tests.use(require('express').json());
  tests.use((request, response, next) => {
    request.app.set('trust proxy', true);
    if (
      'TRAVIS_IP_ADDRESSES' in process.env &&
      !process.env.TRAVIS_IP_ADDRESSES.includes(request.ip)
    ) {
      app.log(`Refused a request to ${request.originalUrl} from ${request.ip}`);
      response.status(403).end('You are not Travis!');
    } else {
      next();
    }
  });

  tests.post(
    '/:headSha/:type/:subType/:status(queued|started|skipped)',
    async (request, response) => {
      const {headSha, type, subType, status} = request.params;
      app.log(
        `Creating/updating a new GitHub check for the ${type} ` +
          `tests (${subType}) for pull request with head commit SHA ` +
          `${headSha}, with a status of '${status}'`
      );

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
          pullRequestSnapshot,
          type,
          subType,
          status
        );
      } catch (error) {
        app.log(`ERROR: ${error}`);
        return response.status(400).end(error);
      }

      const github = await app.auth(pullRequestSnapshot.installationId);
      if (checkRunId === null) {
        const check = await github.checks.create(params);
        await db('checks').insert({
          headSha,
          type,
          subType,
          checkRunId: check.data.id,
        });
      } else {
        await github.checks.update(
          Object.assign(params, {
            check_run_id: checkRunId,
          })
        );
      }

      return response.end();
    }
  );

  tests.post(
    '/:headSha/:type/:subType/report/:passed/:failed',
    async (request, response) => {
      const {headSha, type, subType, passed, failed} = request.params;
      const travisJobUrl =
        'travisJobUrl' in request.body ? request.body.travisJobUrl : null;
      const buildCop = await getBuildCop(db);
      app.log(
        `Reporting the results of the ${type} tests (${subType}) to the ` +
          `GitHub check for pull request with head commit SHA ${headSha}`
      );
      app.log(`Passed: ${passed} | Failed: ${failed}`);

      const pullRequestSnapshot = await getPullRequestSnapshot(db, headSha);
      const checkRunId = await getCheckRunId(db, headSha, type, subType);
      if (pullRequestSnapshot === undefined || checkRunId === null) {
        return response
          .status(404)
          .end(
            'No existing status check was found for ' +
              `${headSha}/${type}/${subType}`
          );
      }

      const params = createReportedCheckParams(
        pullRequestSnapshot,
        type,
        subType,
        checkRunId,
        passed,
        failed,
        buildCop,
        travisJobUrl
      );
      const github = await app.auth(pullRequestSnapshot.installationId);
      await github.checks.update(params);

      await db('checks')
        .update({passed, failed, errored: false})
        .where({headSha, type, subType});

      return response.end();
    }
  );

  tests.post(
    '/:headSha/:type/:subType/report/errored',
    async (request, response) => {
      const {headSha, type, subType} = request.params;
      const travisJobUrl =
        'travisJobUrl' in request.body ? request.body.travisJobUrl : null;
      const buildCop = await getBuildCop(db);
      app.log(
        `Reporting that ${type} tests (${subType}) have errored to the ` +
          `GitHub check for pull request with head commit SHA ${headSha}`
      );

      const pullRequestSnapshot = await getPullRequestSnapshot(db, headSha);
      const checkRunId = await getCheckRunId(db, headSha, type, subType);
      if (pullRequestSnapshot === undefined || checkRunId === null) {
        return response
          .status(404)
          .end(
            'No existing status check was found for ' +
              `${headSha}/${type}/${subType}`
          );
      }

      const params = createErroredCheckParams(
        pullRequestSnapshot,
        type,
        subType,
        checkRunId,
        buildCop,
        travisJobUrl
      );
      const github = await app.auth(pullRequestSnapshot.installationId);
      await github.checks.update(params);

      await db('checks')
        .update({passed: null, failed: null, errored: true})
        .where({headSha, type, subType});

      return response.end();
    }
  );

  const buildCop = app.route('/v0/build-cop');
  buildCop.use(require('express').json());
  buildCop.use((request, response, next) => {
    if (
      !('accessToken' in request.body) ||
      request.body.accessToken != process.env.BUILD_COP_UPDATE_TOKEN
    ) {
      app.log(`Refused a request to ${request.originalUrl} from ${request.ip}`);
      response.status(403).end('Access token missing or not authorized');
    } else {
      next();
    }
  });

  buildCop.post('/update', async (request, response) => {
    if (!('username' in request.body) || !request.body.username) {
      return response
        .status(400)
        .end('POST request to /build-cop must contain field "username"');
    }

    await db('buildCop').update({username: request.body.username});

    return response.end();
  });
};
