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

const _ = require('lodash');
const sleep = require('sleep-promise');
const {OwnersCheck} = require('./owners_check');
const {OwnersParser} = require('./parser');

const GITHUB_CHECKRUN_DELAY = 2000;
const GITHUB_GET_MEMBERS_DELAY = 3000;

/**
 * Bot to run the owners check and create/update the GitHub check-run.
 */
class OwnersBot {
  /**
   * Constructor.
   *
   * @param {!LocalRepository} repo local copy of the repository.
   */
  constructor(repo) {
    this.repo = repo;
    this.teams = {};
    // Defined as a property, to allow overriding in tests.
    this.GITHUB_CHECKRUN_DELAY = GITHUB_CHECKRUN_DELAY;
    this.GITHUB_GET_MEMBERS_DELAY = GITHUB_GET_MEMBERS_DELAY;
  }

  /**
   * Initialize the bot's list of teams.
   *
   * Also initializes each team's member list, spaced out to avoid hitting rate
   * limits. This is so that the member lists of many teams do not need to be
   * requested all at once when parsing the owners tree.
   *
   * @param {!GitHub} github GitHub API interface.
   */
  async initTeams(github) {
    const teamList = await github.getTeams();
    for (const team of teamList) {
      await team.fetchMembers(github);
      this.teams[team.toString()] = team;
      sleep(this.GITHUB_GET_MEMBERS_DELAY);
    }
  }

  /**
   * Fetch and initialize key data for running checks on PR.
   *
   * @param {!GitHub} github GitHub API interface.
   * @param {!PullRequest} pr pull request to initialize data for.
   * @return {{
   *     tree: OwnersTree,
   *     approvers: string[],
   *     changedFiles: string[],
   * }} key structures needed to check PR ownership.
   */
  async initPr(github, pr) {
    await this.repo.checkout();

    const parser = new OwnersParser(this.repo, this.teams, github.log);
    const treeParse = await parser.parseOwnersTree();
    treeParse.errors.forEach(error => {
      github.logger.warn(error);
    });
    const tree = treeParse.result;

    const approvers = await this._getApprovers(github, pr);
    const changedFiles = await github.listFiles(pr.number);

    return {tree, approvers, changedFiles};
  }

  /**
   * Runs the steps to create or update an owners-bot check-run on a GitHub Pull
   * Request.
   *
   * @param {!GitHub} github GitHub API interface.
   * @param {!PullRequest} pr pull request to run owners check on.
   */
  async runOwnersCheck(github, pr) {
    const {tree, approvers, changedFiles} = await this.initPr(github, pr);
    const ownersCheck = new OwnersCheck(tree, approvers, changedFiles);
    const checkRunId = await github.getCheckRunId(pr.headSha);
    const latestCheckRun = ownersCheck.run();

    if (checkRunId) {
      await github.updateCheckRun(checkRunId, latestCheckRun);
    } else {
      // We need to add a delay on the PR creation and check creation since
      // GitHub might not be ready.
      // TODO(rcebulko): Verify this is still needed.
      await sleep(this.GITHUB_CHECKRUN_DELAY);
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

  /**
   * Identifies all reviewers whose latest reviews are approvals.
   *
   * Also includes the author, unless the author has explicitly left a blocking
   * review.
   *
   * @private
   * @param {!GitHub} github GitHub API interface.
   * @param {!PullRequest} pr pull request to fetch approvers for.
   * @return {string[]} list of usernames.
   */
  async _getApprovers(github, pr) {
    const reviews = await github.getReviews(pr.number);
    // Sort by the latest submitted_at date to get the latest review.
    const sortedReviews = reviews.sort((a, b) => b.submittedAt - a.submittedAt);
    // This should always pick out the first instance.
    const uniqueReviews = _.uniqBy(sortedReviews, 'reviewer');
    const uniqueApprovals = uniqueReviews.filter(review => review.isApproved);
    const approvers = uniqueApprovals.map(approval => approval.reviewer);

    // The author of a PR implicitly gives approval over files they own.
    if (!approvers.includes(pr.author)) {
      approvers.push(pr.author);
    }

    return approvers;
  }
}

module.exports = {OwnersBot};
