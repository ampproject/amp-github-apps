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

const sleep = require('sleep-promise');
const {GitHub, PullRequest} = require('./src/github');
const {OwnersCheck} = require('./src/owners_check');
const {Owner} = require('./src/owner');

const GITHUB_CHECKRUN_DELAY = 2000;

module.exports = app => {
  app.on(['pull_request.opened', 'pull_request.synchronized'], onPullRequest);
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
   * Runs the steps to create a new check run on a newly opened Pull Request
   * on GitHub.
   *
   * @param {!GitHub} github GitHub API interface.
   * @param {!PullRequest} pr pull request to run owners check on.
   */
  async function runOwnersCheck(github, pr) {
    const ownersCheck = new OwnersCheck(github, pr);
    const fileOwners = await Owner.getOwners(github, pr.number);
    const approvers = await ownersCheck.getApprovers();

    const checkRunId = await github.getCheckRunId(pr.headSha);
    const latestCheckRun = ownersCheck.buildCheckRun(fileOwners, approvers);

    if (checkRunId) {
      await github.updateCheckRun(checkRunId, latestCheckRun);
    } else {
      // We need to add a delay on the PR creation and check creation since
      // GitHub might not be ready.
      // TODO: Verify this is still needed.
      await sleep(GITHUB_CHECKRUN_DELAY);
      await github.createCheckRun(pr.headSha, latestCheckRun);
    }
  }

  /**
   * Probot handler for newly opened pull request.
   *
   * @param {!Context} context Probot request context.
   */
  async function onPullRequest(context) {
    const pr = PullRequest.fromGitHubResponse(context.payload.pull_request);

    await runOwnersCheck(GitHub.fromContext(context), pr);
  }

  /**
   * Probot handler for check-run re-requests.
   *
   * @param {!Context} context Probot request context.
   */
  async function onCheckRunRerequest(context) {
    const payload = context.payload;
    const prNumber = payload.check_run.check_suite.pull_requests[0].number;
    const github = GitHub.fromContext(context);
    const pr = await github.getPullRequest(prNumber);

    await runOwnersCheck(github, pr);
  }

  /**
   * Probot handler for after a PR review is submitted.
   *
   * @param {!Context} context Probot request context.
   */
  async function onPullRequestReview(context) {
    const payload = context.payload;
    const prNumber = payload.pull_request.number;
    const github = GitHub.fromContext(context);
    const pr = await github.getPullRequest(prNumber);

    await runOwnersCheck(github, pr);
  }
};
