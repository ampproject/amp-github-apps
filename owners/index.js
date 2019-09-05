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

const {GitHub, PullRequest} = require('./src/github');
const {LocalRepository} = require('./src/local_repo')
const {OwnersBot} = require('./src/owners_bot')

module.exports = app => {
  const localRepo = new LocalRepository(process.env.GITHUB_REPO_DIR);
  const ownersBot = new OwnersBot(localRepo);

  app.on(['pull_request.opened', 'pull_request.synchronize'], onPullRequest);
  app.on('check_run.rerequested', onCheckRunRerequest);
  app.on('pull_request_review.submitted', onPullRequestReview);

  // Probot does not stream properly to GCE logs so we need to hook into
  // bunyan explicitly and stream it to process.stdout.
  app.log.target.addStream({
    name: 'app-custom-stream',
    stream: process.stdout,
    level: process.env.LOG_LEVEL || 'info',
  });

  /**
   * Probot handler for newly opened pull request.
   *
   * @param {!Context} context Probot request context.
   */
  async function onPullRequest(context) {
    const pr = PullRequest.fromGitHubResponse(context.payload.pull_request);

    await ownersBot.runOwnersCheck(GitHub.fromContext(context), pr);
  }

  /**
   * Probot handler for check-run re-requests.
   *
   * @param {!Context} context Probot request context.
   */
  async function onCheckRunRerequest(context) {
    const payload = context.payload;
    const prNumber = payload.check_run.check_suite.pull_requests[0].number;

    await ownersBot.runOwnersCheckOnPrNumber(GitHub.fromContext(context), prNumber);
  }

  /**
   * Probot handler for after a PR review is submitted.
   *
   * @param {!Context} context Probot request context.
   */
  async function onPullRequestReview(context) {
    const payload = context.payload;
    const prNumber = payload.pull_request.number;

    await ownersBot.runOwnersCheckOnPrNumber(GitHub.fromContext(context), prNumber);
  }
};
