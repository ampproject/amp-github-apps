/**
 * * Copyright 2019 The AMP HTML Authors. All Rights Reserved.
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

const bootstrap = require('./bootstrap');
const InfoServer = require('./info_server');
const path = require('path');
const {GitHub, PullRequest, Team} = require('./src/api/github');
const {OwnersCheck} = require('./src/ownership/owners_check');

const NO_REQUEST_OWNERS_REGEX = /\b(WIP|work in progress|DO NOT (MERGE|SUBMIT|REVIEW))\b/i;

module.exports = app => {
  const {github, ownersBot, initialized} = bootstrap(app.log);

  /**
   * Listen for webhooks and provide handlers with a GitHub interface and the
   * event payload.
   *
   * @param {string|Array<string>} events event or list of events to listen to.
   * @param {!function} cb callback function.
   */
  function listen(events, cb) {
    app.on(events, async context => {
      await initialized;

      let handlerGithub;
      try {
        handlerGithub = GitHub.fromContext(context);
        handlerGithub.user = github;
      } catch (e) {
        // Some webhooks do not provide a GitHub instance in their context.
        handlerGithub = github;
      }

      await cb(handlerGithub, context.payload);
    });
  }

  /**
   * Identify if a PR is in a state that reviewers should be assigned.
   *
   * @param {!object} pr GitHub PR payload.
   * @return {boolean} false if the PR is a draft or the title contains WIP/DNS.
   */
  function shouldAssignReviewers(pr) {
    return !(pr.draft || NO_REQUEST_OWNERS_REGEX.test(pr.title));
  }

  /** Probot request handlers **/
  listen(
    ['pull_request.opened', 'pull_request.ready_for_review'],
    async (github, payload) => {
      const prPayload = payload.pull_request;
      if (prPayload.draft) {
        return;
      }

      await ownersBot.runOwnersCheck(
        github,
        PullRequest.fromGitHubResponse(prPayload),
        shouldAssignReviewers(prPayload)
      );
    }
  );

  listen('pull_request.synchronize', async (github, payload) => {
    const prPayload = payload.pull_request;
    if (prPayload.draft) {
      return;
    }

    const pr = PullRequest.fromGitHubResponse(prPayload);
    await ownersBot.runOwnersCheck(github, pr);
  });

  listen('check_run.rerequested', async (github, payload) => {
    const prPayload = payload.check_run.check_suite.pull_requests[0];
    if (prPayload.draft) {
      return;
    }

    await ownersBot.runOwnersCheckOnPrNumber(github, prPayload.number);
  });

  listen('pull_request_review.submitted', async (github, payload) => {
    const prPayload = payload.pull_request;
    if (prPayload.draft) {
      return;
    }

    await ownersBot.runOwnersCheckOnPrNumber(github, prPayload.number);
  });

  listen(
    [
      'team.created',
      'team.deleted',
      'team.edited',
      'membership.added',
      'membership.removed',
    ],
    async (github, payload) => {
      const {slug} = payload.team;
      await ownersBot.syncTeam(new Team(github.owner, slug), github);
    }
  );

  listen('pull_request.closed', async (github, payload) => {
    if (!payload.pull_request.merged) {
      return;
    }

    const pr = PullRequest.fromGitHubResponse(payload.pull_request);
    const changedFiles = await github.listFiles(pr.number);
    const changedOwners = changedFiles.filter(
      filename => path.basename(filename) === 'OWNERS'
    );

    if (changedOwners.length) {
      await ownersBot.refreshTree(github.logger);
    }
  });

  if (process.env.NODE_ENV !== 'test') {
    new InfoServer(ownersBot, github, app.route(), app.log);
  }

  // Since this endpoint triggers a ton of GitHub API requests, there is a risk
  // of it being spammed; so it is not exposed through the info server.
  app.route('/admin').get('/check/:prNumber', async (req, res) => {
    const pr = await github.getPullRequest(req.params.prNumber);
    const {changedFiles, reviewers} = await ownersBot.initPr(github, pr);
    const {checkRun} = new OwnersCheck(
      ownersBot.treeParse.result,
      changedFiles,
      reviewers
    ).run();

    res.send(checkRun.json);
  });
};
