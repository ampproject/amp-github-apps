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

const Octokit = require('@octokit/rest');
const {GitHub, PullRequest, Team} = require('./src/github');
const {LocalRepository} = require('./src/repo');
const {OwnersBot} = require('./src/owners_bot');
const {OwnersParser} = require('./src/parser');
const {OwnersCheck} = require('./src/owners_check');
const express = require('express');

const GITHUB_ACCESS_TOKEN = process.env.GITHUB_ACCESS_TOKEN;
const GITHUB_REPO = process.env.GITHUB_REPO || 'ampproject/amphtml';
const [GITHUB_REPO_OWNER, GITHUB_REPO_NAME] = GITHUB_REPO.split('/');

const APP_ID = process.env.APP_ID || 'UNKNOWN';
const APP_COMMIT_SHA = process.env.APP_COMMIT_SHA || 'UNKNOWN';
const APP_COMMIT_MSG = process.env.APP_COMMIT_MSG || 'UNKNOWN';
const INFO_SERVER_PORT = Number(process.env.INFO_SERVER_PORT || 8081);

const CACHED_TREE_REFRESH_MS = 10 * 60 * 1000;

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

  // Probot does not stream properly to GCE logs so we need to hook into
  // bunyan explicitly and stream it to process.stdout.
  if (process.env.NODE_ENV !== 'test') {
    app.log.target.addStream({
      name: 'app-custom-stream',
      stream: process.stdout,
      level: process.env.LOG_LEVEL || 'info',
    });
  }

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

  // Since the status server is publicly accessible, we don't want any
  // endpoints to be making API calls or doing disk I/O. Rather than parsing
  // the file tree from the local repo on every request, we keep a local copy
  // and update it every ten minutes.
  const parser = new OwnersParser(localRepo, ownersBot.teams, app.log);
  let treeParse = {result: {}, errors: []};
  /** Updates the cached copy of the parsed ownership tree. */
  function updateTree() {
    app.log('Updating cached owners tree');
    parser.parseOwnersTree().then(parse => {
      treeParse = parse;
    });
  }

  if (process.env.NODE_ENV !== 'test') {
    updateTree();
    teamsInitialized.then(updateTree);
    setInterval(updateTree, CACHED_TREE_REFRESH_MS);

    /** Health check server endpoints **/
    const expressApp = express();
    expressApp.get('/status', (req, res) => {
      res.send(
        [
          `The OWNERS bot is live and running on ${GITHUB_REPO}!`,
          `App ID: ${APP_ID}`,
          `Deployed commit: <code>${APP_COMMIT_SHA}</code> ${APP_COMMIT_MSG}`,
          '<a href="/tree">Owners Tree</a>',
          '<a href="/teams">Organization Teams</a>',
        ].join('<br>')
      );
    });

    expressApp.get('/tree', (req, res) => {
      const treeHeader = '<h3>OWNERS tree</h3>';
      const treeDisplay = `<pre>${treeParse.result.toString()}</pre>`;

      let output = `${treeHeader}${treeDisplay}`;
      if (treeParse.errors.length) {
        const errorHeader = '<h3>Parser Errors</h3>';
        const errorDisplay = treeParse.errors
          .map(error => error.toString())
          .join('<br>');
        output += `${errorHeader}<code>${errorDisplay}</code>`;
      }

      res.send(output);
    });

    expressApp.get('/teams', (req, res) => {
      const teamSections = [];
      Object.entries(ownersBot.teams).forEach(([name, team]) => {
        teamSections.push(
          [
            `Team "${name}" (ID: ${team.id}):`,
            ...team.members.map(username => `- ${username}`),
          ].join('<br>')
        );
      });

      res.send(['<h2>Teams</h2>', ...teamSections].join('<br><br>'));
    });

    expressApp.listen(INFO_SERVER_PORT, () => {
      app.log(`Starting status server on port ${INFO_SERVER_PORT}`);
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
