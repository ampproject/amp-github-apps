/**
 * Copyright 2019 Google Inc.
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

require('dotenv').config();

const Octokit = require('@octokit/rest');

const infoServer = require('./info_server');
const {GitHub, PullRequest, Team} = require('./src/github');
const {LocalRepository} = require('./src/repo');
const {OwnersBot} = require('./src/owners_bot');
const {OwnersCheck} = require('./src/owners_check');

const GITHUB_ACCESS_TOKEN = process.env.GITHUB_ACCESS_TOKEN;
const GITHUB_REPO = process.env.GITHUB_REPO || 'ampproject/amphtml';
const [GITHUB_REPO_OWNER, GITHUB_REPO_NAME] = GITHUB_REPO.split('/');
const INFO_SERVER_PORT = Number(process.env.INFO_SERVER_PORT || 8081);

module.exports = app => {
  const localRepo = new LocalRepository(process.env.GITHUB_REPO_DIR);
  const ownersBot = new OwnersBot(localRepo);
  const sharedGithub = new GitHub(
    new Octokit({auth: `token ${GITHUB_ACCESS_TOKEN}`}),
    GITHUB_REPO_OWNER,
    GITHUB_REPO_NAME,
    app.log
  );
  ownersBot.initTeams(sharedGithub);

  /**
   * Listen for webhooks and provide handlers with a GitHub interface and the
   * event payload.
   *
   * @param {!string|string[]} events event or list of events to listen to.
   * @param {!function} cb callback function.
   */
  function listen(events, cb) {
    app.on(events, async context => {
      let github;
      try {
        github = GitHub.fromContext(context);
      } catch (e) {
        // Some webhooks do not provide a GitHub instance in their context.
        github = sharedGithub;
      }

      await cb(github, context.payload);
    });
  }

  /** Probot request handlers **/
  listen('pull_request.opened', async (github, payload) => {
    const pr = PullRequest.fromGitHubResponse(payload.pull_request);
    await ownersBot.runOwnersCheck(github, pr, /* requestOwners */ true);
  });

  listen('pull_request.synchronize', async (github, payload) => {
    const pr = PullRequest.fromGitHubResponse(payload.pull_request);
    await ownersBot.runOwnersCheck(github, pr);
  });

  listen('check_run.rerequested', async (github, payload) => {
    const prNumber = payload.check_run.check_suite.pull_requests[0].number;
    await ownersBot.runOwnersCheckOnPrNumber(github, prNumber);
  });

  listen('pull_request_review.submitted', async (github, payload) => {
    const prNumber = payload.pull_request.number;
    await ownersBot.runOwnersCheckOnPrNumber(github, prNumber);
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
      const {id, slug} = payload.team;
      await ownersBot.syncTeam(new Team(id, GITHUB_REPO_OWNER, slug), github);
    }
  );

  if (process.env.NODE_ENV !== 'test') {
    infoServer(INFO_SERVER_PORT, ownersBot, app.log);
  }

  // Since this endpoint triggers a ton of GitHub API requests, there is a risk
  // of it being spammed; so it is not exposed through the info server.
  app.route('/admin').get('/check/:prNumber', async (req, res) => {
    const pr = await sharedGithub.getPullRequest(req.params.prNumber);
    const {changedFiles, reviewers} = await ownersBot.initPr(sharedGithub, pr);
    const ownersCheck = new OwnersCheck(
      ownersBot.treeParse.result,
      changedFiles,
      reviewers
    );

    const {checkRun} = ownersCheck.run();

    res.send(checkRun.json);
  });
};
