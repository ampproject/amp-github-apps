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
const {LocalRepository} = require('./src/local_repo');
const {OwnersBot} = require('./src/owners_bot');

module.exports = app => {
  const localRepo = new LocalRepository(process.env.GITHUB_REPO_DIR);
  const ownersBot = new OwnersBot(localRepo);
  const router = app.route('/admin');

  // Probot does not stream properly to GCE logs so we need to hook into
  // bunyan explicitly and stream it to process.stdout.
  app.log.target.addStream({
    name: 'app-custom-stream',
    stream: process.stdout,
    level: process.env.LOG_LEVEL || 'info',
  });

  router.get('/status', (req, res) => {
    res.send('The OWNERS bot is live and running!');
  });

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
