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
const {OwnersParser} = require('./src/owners');
const {OwnersCheck} = require('./src/owners_check');

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

module.exports = app => {
  const localRepo = new LocalRepository(process.env.GITHUB_REPO_DIR);
  const ownersBot = new OwnersBot(localRepo);
  const treeCache = new OneDayCache();
  const router = app.route('/admin');

  // Probot does not stream properly to GCE logs so we need to hook into
  // bunyan explicitly and stream it to process.stdout.
  app.log.target.addStream({
    name: 'app-custom-stream',
    stream: process.stdout,
    level: process.env.LOG_LEVEL || 'info',
  });

  /** Health check server endpoints **/
  router.get('/status', (req, res) => {
    res.send('The OWNERS bot is live and running!');
  });

  router.get('/tree', async (req, res) => {
    const ownersTree = await treeCache.wrapAsync(async () => {
      const parser = new OwnersParser(localRepo, req.log);
      return await parser.parseOwnersTree();
    });

    res.send(`<pre>${ownersTree.toString()}</pre>`);
  });

  router.get('/check/:prNumber', async (req, res) => {
    const octokit = new Octokit({auth: `token ${GITHUB_TOKEN}`});
    const github = new GitHub(octokit, 'ampproject', 'amphtml', app.log);
    const pr = await github.getPullRequest(req.params.prNumber);
    const ownersCheck = new OwnersCheck(localRepo, github, pr);
    const checkRun = await ownersCheck.run();
    res.send(checkRun.json);
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

/**
 * Simple one-day cache for endpoints that do Git commands and file reads.
 *
 * TODO(rcebulko): Replace with a real caching solution once the health-check
 * server gets real functionality.
 */
class OneDayCache {
  /**
   * Constructor.
   */
  constructor() {
    this.lastUpdate = this.yesterday;
    this.lastValue = null;
  }

  /**
   * Get the date 24 hours ago.
   *
   * @return {Date} yesterday's date.
   */
  get yesterday() {
    const date = new Date();
    date.setDate(date.getDate() - 1);
    return date;
  }

  /**
   * Wraps an async function with the cache.
   *
   * @param {!function} asyncFn function to wrap.
   * @return {any} computed or cached result.
   */
  async wrapAsync(asyncFn) {
    if (this.lastValue === null || this.lastUpdate < this.yesterday) {
      this.lastUpdate = new Date();
      this.lastValue = await asyncFn();
    }

    return this.lastValue;
  }
}
