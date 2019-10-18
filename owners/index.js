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
const {OwnersParser} = require('./src/parser');
const {OwnersCheck} = require('./src/owners_check');

const GITHUB_ACCESS_TOKEN = process.env.GITHUB_ACCESS_TOKEN;
const GITHUB_REPO = process.env.GITHUB_REPO || 'ampproject/amphtml';
const [GITHUB_REPO_OWNER, GITHUB_REPO_NAME] = GITHUB_REPO.split('/');
const INFO_SERVER_PORT = Number(process.env.INFO_SERVER_PORT || 8081);

module.exports = app => {
  const localRepo = new LocalRepository(process.env.GITHUB_REPO_DIR);
  const ownersBot = new OwnersBot(localRepo);
  const github = new GitHub(
    new Octokit({auth: `token ${GITHUB_ACCESS_TOKEN}`}),
    GITHUB_REPO_OWNER,
    GITHUB_REPO_NAME,
    app.log
  );
  const teamsInitialized = ownersBot.initTeams(github);

  /** Probot request handlers **/
  app.on(['pull_request.opened'], async context => {
    await ownersBot.runOwnersCheck(
      GitHub.fromContext(context),
      PullRequest.fromGitHubResponse(context.payload.pull_request),
      /* requestOwners */ true
    );
  });

  app.on(['pull_request.synchronize'], async context => {
    await ownersBot.runOwnersCheck(
      GitHub.fromContext(context),
      PullRequest.fromGitHubResponse(context.payload.pull_request)
    );
  });

  app.on('check_run.rerequested', async context => {
    const payload = context.payload;
    const prNumber = payload.check_run.check_suite.pull_requests[0].number;

    await ownersBot.runOwnersCheckOnPrNumber(
      GitHub.fromContext(context),
      prNumber
    );
  });

  app.on('pull_request_review.submitted', async context => {
    const payload = context.payload;
    const prNumber = payload.pull_request.number;

    await ownersBot.runOwnersCheckOnPrNumber(
      GitHub.fromContext(context),
      prNumber
    );
  });

  app.on(
    [
      'team.created',
      'team.deleted',
      'team.edited',
      'membership.added',
      'membership.removed',
    ],
    async context => {
      const {id, slug} = context.payload.team;
      const team = new Team(id, GITHUB_REPO_OWNER, slug);

      await team.fetchMembers(github);
      ownersBot.teams[team.toString()] = team;
    }
  );

  if (process.env.NODE_ENV !== 'test') {
    // Since the status server is publicly accessible, we don't want any
    // endpoints to be making API calls or doing disk I/O. Rather than parsing
    // the file tree from the local repo on every request, we keep a local copy
    // and update it every ten minutes.
    const parser = new OwnersParser(localRepo, ownersBot.teams, app.log);
    teamsInitialized.then(() => {
      infoServer(INFO_SERVER_PORT, parser, app.log);
    });
  }

  // Since this endpoint triggers a ton of GitHub API requests, there is a risk
  // of it being spammed; so it is not exposed through the info server.
  app.route('/admin').get('/check/:prNumber', async (req, res) => {
    const pr = await github.getPullRequest(req.params.prNumber);
    const {tree, changedFiles, reviewers} = await ownersBot.initPr(github, pr);
    const ownersCheck = new OwnersCheck(tree, changedFiles, reviewers);

    const {checkRun} = ownersCheck.run();

    res.send(checkRun.json);
  });
};
