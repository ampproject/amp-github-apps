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

const {body, validationResult} = require('express-validator/check');
const bodyParser = require('body-parser');
const express = require('express');
const {getBuildCop, getCheckRunResults} = require('./db');
const {
  installRootAuthentications,
  installRouteAuthentications,
} = require('./auth');

let EXPRESS_SETTING_ARE_SET = false;

/**
 * Create a parameters object for reporting a skipped tests status to an
 * existing GitHub status check
 *
 * @param {!Request} request web Request object.
 * @return {!object} a parameters object for github.checks.update.
 */
function createSkippedCheckParams(request) {
  const {type, subType, passed, failed, errored} = request.check;
  const {user} = request.session.passport;
  const {reason} = request.body;

  let text = '';
  const summaryVerb = errored ? 'errored' : 'failed';
  if (!errored) {
    text = `* *${passed}* test${passed != 1 ? 's' : ''} PASSED\n` +
      `* *${failed}* test${failed != 1 ? 's' : ''} FAILED\n\n`;
  }
  text += `The ${summaryVerb} ${type} tests (${subType}) were skipped by ` +
    `@${user}.\n` +
    `The reason given was: *${reason}*`;

  return {
    owner: request.check.owner,
    repo: request.check.repo,
    check_run_id: request.check.checkRunId,
    completed_at: new Date().toISOString(),
    conclusion: 'success',
    output: {
      title: `Skipped by @${user}`,
      summary: `The ${type} tests (${subType}) have previously ` +
        `${summaryVerb} on Travis.`,
      text,
    },
  };
}


exports.installWebUiRouter = (app, db) => {
  const root = app.route();
  installRootAuthentications(root);

  root.use('/static', express.static('./static'));

  const tests = app.route('/tests');
  tests.use((request, response, next) => {
    // Hack until https://github.com/probot/probot/issues/878 is fixed.
    if (!EXPRESS_SETTING_ARE_SET) {
      EXPRESS_SETTING_ARE_SET = true;
      request.app.set('trust proxy', true);
      request.app.set('views', [request.app.get('views'), './views']);
    }
    next();
  });
  installRouteAuthentications(tests);
  tests.use(bodyParser.urlencoded({extended: false}));
  tests.use(async (request, response, next) => {
    const {user} = request.session.passport;
    if (process.env.APPROVING_USERS.split(',').includes(user)) {
      return next();
    }

    const buildCop = await getBuildCop(db);
    if (user == buildCop) {
      return next();
    }

    response.status(403).render('403', {user, buildCop});
  });

  tests.all('/:headSha/:type/:subType/:action(status|skip)',
      async (request, response, next) => {
        const {headSha, type, subType} = request.params;
        request.shortHeadSha = headSha.substr(0, 7);
        const check = await getCheckRunResults(db, headSha, type, subType);
        if (check === null ||
            (!check.errored &&
              (check.passed === null || check.failed === null))) {
          return response.status(404).render('404', {
            headSha: request.shortHeadSha,
            type,
            subType,
          });
        }
        request.check = check;
        next();
      });

  tests.get('/:headSha/:type/:subType/status', async (request, response) => {
    response.render('status', Object.assign({
      shortHeadSha: request.shortHeadSha,
      isSkipping: false,
    }, request.check));
  });

  tests.all('/:headSha/:type/:subType/skip',
      async (request, response, next) => {
        if (request.check.failed == 0) {
          return response.status(400).render('400', {
            message:
                `${request.params.type} tests (${request.params.subType}) ` +
                `for ${request.shortHeadSha} have no failures`,
          });
        }
        next();
      });

  tests.get('/:headSha/:type/:subType/skip', async (request, response) => {
    response.render('status', Object.assign({
      shortHeadSha: request.shortHeadSha,
      isSkipping: true,
    }, request.check));
  });

  tests.post('/:headSha/:type/:subType/skip', [
    body('reason').isLength({min: 1}).withMessage('Reason must not be empty.'),
  ], async (request, response) => {
    const errors = validationResult(request);
    if (!errors.isEmpty()) {
      response.render('status', Object.assign({
        shortHeadSha: request.shortHeadSha,
        isSkipping: true,
        errors: errors.mapped(),
      }, request.check));
      return;
    }

    const params = createSkippedCheckParams(request);
    const github = await app.auth(request.check.installationId);
    await github.checks.update(params);

    response.redirect(
        `https://github.com/${request.check.owner}/${request.check.repo}` +
        `/pull/${request.check.pullRequestId}`);
  });
};
