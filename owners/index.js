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

module.exports = app => {
  app.on(['pull_request.opened', 'pull_request.synchronized'], onPullRequest);
  app.on('check_run.rerequested', onCheckRunRerequest);
  app.on('pull_request_review.submitted', onPullRequestReview);

  // Probot does not stream properly to GCE logs so we need to hook into
  // bunyan explicitly and stream it to process.stdout.
  app.log.target.addStream({
    name: 'app-custom-stream',
    stream: process.stdout,
    level: process.LOG_LEVEL || 'info',
  });

  /**
   * Process a pull request and take any necessary actions.
   *
   * @param {!GitHub} context Probot request context (for logging and GitHub).
   * @param {!JsonObject} pullRequest GitHub Pull Request JSON object.
   */
  async function processPullRequest(context, pullRequest) {
    const pr =
        new PullRequest(GitHub.fromContext(context), pullRequest, context.log);
    await pr.processOpened();
  }

  /**
   * Probot handler for newly opened pull request.
   *
   * @param {!Context} context Probot request context.
   */
  async function onPullRequest(context) {
    await processPullRequest(context, context.payload.pull_request);
  }

  /**
   * Probot handler for check-run re-requests.
   *
   * @param {!Context} context Probot request context.
   */
  async function onCheckRunRerequest(context) {
    const payload = context.payload;
    const pr = await PullRequest.get(
        GitHub.fromContext(context),
        payload.check_run.check_suite.pull_requests[0].number);

    await processPullRequest(context, pr.data);
  }

  /**
   * Probot handler for after a PR review is submitted.
   *
   * @param {!Context} context Probot request context.
   */
  async function onPullRequestReview(context) {
    const payload = context.payload;
    const pr = await PullRequest.get(
        GitHub.fromContext(context), payload.pull_request.number);

    await processPullRequest(context, pr.data);
  }
};
