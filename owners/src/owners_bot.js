/**
 * Copyright 2019 The AMP HTML Authors.
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
const {LocalRepository} = require('./local_repo');
const {CheckRun, OwnersCheck} = require('./owners_check');

const GITHUB_CHECKRUN_DELAY = 2000;

class OwnersBot {
  /**
   * Constructor.
   *
   * @param {!LocalRepository} repo local copy of the repository.
   */
  constructor(repo) {
    this.repo = repo;
  }

  /**
   * Runs the steps to create or update an owners-bot check-run on a GitHub Pull
   * Request.
   *
   * @param {!GitHub} github GitHub API interface.
   * @param {!PullRequest} pr pull request to run owners check on.
   */
  async runOwnersCheck(github, pr) {
    const ownersCheck = new OwnersCheck(this.repo, github, pr);
    let checkRunId;
    let latestCheckRun;

    try {
      checkRunId = await github.getCheckRunId(pr.headSha);
      latestCheckRun = await ownersCheck.run();
    } catch (error) {
      // If anything goes wrong, report a failing check.
      latestCheckRun = new CheckRun(
        'The check encountered an error!',
        'OWNERS check encountered an error:\n' + error
      );
    }

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
   * Runs the steps to create or update an owners-bot check-run on a GitHub Pull
   * Request.
   *
   * @param {!GitHub} github GitHub API interface.
   * @param {!number} prNumber pull request number.
   */
  async runOwnersCheckOnPrNumber(github, prNumber) {
    const pr = await github.getPullRequest(prNumber);
    await this.runOwnersCheck(github, pr);
  }
}

module.exports = {OwnersBot};
