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
const {GitHub, PullRequest} = require('./src/github');
const {LocalRepository} = require('./src/local_repo');
const {OwnersBot} = require('./src/owners_bot');
const {OwnersParser} = require('./src/parser');
const {OwnersCheck} = require('./src/owners_check');

const GITHUB_ACCESS_TOKEN = process.env.GITHUB_ACCESS_TOKEN;
const GITHUB_REPO = process.env.GITHUB_REPO || 'ampproject/amphtml';
const [GITHUB_REPO_OWNER, GITHUB_REPO_NAME] = GITHUB_REPO.split('/');

const GCLOUD_PROJECT = process.env.GCLOUD_PROJECT || 'UNKNOWN';
const APP_ID = process.env.APP_ID || 'UNKNOWN';
const APP_COMMIT_SHA = process.env.APP_COMMIT_SHA || 'UNKNOWN';
const APP_COMMIT_MSG = process.env.APP_COMMIT_MSG || 'UNKNOWN';

module.exports = app => {
  const localRepo = new LocalRepository(process.env.GITHUB_REPO_DIR);

  const ownersBot = new OwnersBot(localRepo);
  const github = new GitHub(
    new Octokit({auth: `token ${GITHUB_ACCESS_TOKEN}`}),
    GITHUB_REPO_OWNER,
    GITHUB_REPO_NAME,
    app.log
  );
  // TODO(rcebulko): Add a mechanism to periodically refresh teams.
  ownersBot.initTeams(github);

  const adminRouter = app.route('/admin');

  // Probot does not stream properly to GCE logs so we need to hook into
  // bunyan explicitly and stream it to process.stdout.
  app.log.target.addStream({
    name: 'app-custom-stream',
    stream: process.stdout,
    level: process.env.LOG_LEVEL || 'info',
  });

  /** Health check server endpoints **/
  // TODO(rcebulko): Implement GitHub authentication to prevent spamming any of
  // these endpoints.
  adminRouter.get('/status', (req, res) => {
    res.send(
      [
        `The OWNERS bot is live and running on ${GITHUB_REPO}!`,
        `Project: ${GCLOUD_PROJECT}`,
        `App ID: ${APP_ID}`,
        `Deployed commit: <code>${APP_COMMIT_SHA}</code> ${APP_COMMIT_MSG}`,
      ].join('<br>')
    );
  });

  adminRouter.get('/tree', async (req, res) => {
    const parser = new OwnersParser(localRepo, ownersBot.teams, req.log);
    const treeParse = await parser.parseOwnersTree();
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

  adminRouter.get('/check/:prNumber', async (req, res) => {
    const pr = await github.getPullRequest(req.params.prNumber);
    const {tree, approvers, changedFiles} = await ownersBot.initPr(github, pr);
    const ownersCheck = new OwnersCheck(tree, approvers, changedFiles);
    const checkRun = ownersCheck.run();

    res.send(checkRun.json);
  });

  adminRouter.get('/teams', (req, res) => {
    const teamSections = [];
    Object.entries(ownersBot.teams).forEach(([name, team]) => {
      teamSections.push(
        [
          `Team "${name}" (ID: ${team.id}):`,
          ...team.members.map(username => `- ${username}`),
        ].join('<br>')
      );
    });

    res.send(teamSections.join('<br><br>'));
  });

  /** Probot request handlers **/
  app.on(['pull_request.opened', 'pull_request.synchronize'], async context => {
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
};
