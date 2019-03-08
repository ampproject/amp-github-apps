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
const {getCheckRunResults} = require('./db');
const {
  installRootAuthentications,
  installRouteAuthentications,
} = require('./auth');

let EXPRESS_SETTING_ARE_SET = false;

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
  tests.use((request, response, next) => {
    const {user} = request.session.passport;
    // TODO(danielrozenberg): also include a check for the current build cop.
    if (process.env.APPROVING_USERS.split(',').includes(user)) {
      return next();
    } else {
      // TODO(danielrozenberg): add buildCop.
      response.status(403).render('403', {user});
    }
  });

  tests.all('/:headSha/:type/:action(status|skip)',
      async (request, response, next) => {
        const {headSha, type} = request.params;
        request.short_head_sha = headSha.substr(0, 7);
        const check = await getCheckRunResults(db, headSha, type);
        if (check === null || check.passed === null || check.failed === null) {
          return response.status(404).render('404', {
            headSha: request.short_head_sha,
            type,
          });
        }
        request.check = check;
        next();
      });

  tests.get('/:headSha/:type/status', async (request, response) => {
    response.render('status', Object.assign({
      short_head_sha: request.short_head_sha,
      is_skipping: false,
    }, request.check));
  });

  tests.all('/:headSha/:type/skip', async (request, response, next) => {
    if (request.check.failed == 0) {
      return response.status(400).render('400', {
        message:
            `${request.params.type} tests for ${request.short_head_sha} have ` +
            'no failures',
      });
    }
    next();
  });

  tests.get('/:headSha/:type/skip', async (request, response) => {
    response.render('status', Object.assign({
      short_head_sha: request.short_head_sha,
      is_skipping: true,
    }, request.check));
  });

  tests.post('/:headSha/:type/skip', [
    body('reason').isLength({min: 1}).withMessage('Reason must not be empty.'),
  ], async (request, response) => {
    const {passed, failed, type} = request.check;
    const {user} = request.session.passport;
    const {reason} = request.body;

    const errors = validationResult(request);
    if (!errors.isEmpty()) {
      response.render('status', Object.assign({
        short_head_sha: request.short_head_sha,
        is_skipping: true,
        errors: errors.mapped(),
      }, request.check));
      return;
    }

    const github = await app.auth(request.check.installation_id);
    await github.checks.update({
      owner: request.check.owner,
      repo: request.check.repo,
      check_run_id: request.check.check_run_id,
      completed_at: new Date().toISOString(),
      conclusion: 'success',
      output: {
        title: `Skipped by @${user}`,
        summary: `The ${type} tests finished running on Travis.`,
        text: `* *${passed}* test${passed != 1 ? 's' : ''} PASSED\n` +
        `* *${failed}* test${failed != 1 ? 's' : ''} FAILED\n\n` +
        `The failing tests were skipped by @${user}.\n` +
        `The reason given was: *${reason}*`,
      },
    });

    response.redirect(
        `https://github.com/${request.check.owner}/${request.check.repo}` +
        `/pull/${request.check.pull_request_id}`);
  });
};
