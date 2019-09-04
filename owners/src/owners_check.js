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
const {OwnersParser} = require('./owners');

const GITHUB_CHECKRUN_NAME = 'ampproject/owners-check';

/**
 * A GitHub presubmit check-run.
 */
class CheckRun {
  /**
   * Constructor.
   *
   * @param {!string} summary check-run summary text to show in PR.
   * @param {!string} text description of check-run results.
   */
  constructor(summary, text) {
    Object.assign(this, {summary, text});
  }

  /**
   * Produces a JSON version of the object for use with GitHub API.
   *
   * @return {object} JSON object describing check-run.
   */
  get json() {
    return {
      name: GITHUB_CHECKRUN_NAME,
      status: 'completed',
      conclusion: 'neutral',
      completed_at: new Date(),
      output: {
        title: GITHUB_CHECKRUN_NAME,
        summary: this.summary,
        text: this.text,
      },
    };
  }
}

/**
 * Manages checking if a PR has the necessary approvals.
 */
class OwnersCheck {
  /**
   * Constructor.
   *
   * @param {!LocalRepository} repo local repository to read from.
   * @param {!GitHub} github GitHub API interface.
   * @param {!PullRequest} pr pull request to run owners check on.
   */
  constructor(repo, github, pr) {
    const parser = new OwnersParser(repo, github.log);

    Object.assign(this, {github, pr, repo, parser});

    this.tree = null;
    this.approvers = null;
    this.changedFiles = null;
    this.initialized = false;
  }

  /**
   * Initializes key properties requiring async/await.
   */
  async init() {
    await this.repo.checkout();
    this.tree = await this.parser.parseOwnersTree();
    this.approvers = await this._getApprovers();
    this.changedFiles = await this.github.listFiles(this.pr.number);
    this.initialized = true;
  }

  /**
   * Identifies all reviewers whose latest reviews are approvals.
   *
   * Also includes the author, unless the author has explicitly left a blocking
   * review.
   *
   * @private
   * @return {string[]} list of usernames.
   */
  async _getApprovers() {
    const reviews = await this.github.getReviews(this.pr.number);
    // Sort by the latest submitted_at date to get the latest review.
    const sortedReviews = reviews.sort((a, b) => b.submittedAt - a.submittedAt);
    // This should always pick out the first instance.
    const uniqueReviews = _.uniqBy(sortedReviews, 'reviewer');
    const uniqueApprovals = uniqueReviews.filter(review => review.isApproved);
    const approvers = uniqueApprovals.map(approval => approval.reviewer);

    // The author of a PR implicitly gives approval over files they own.
    if (!approvers.includes(this.pr.author)) {
      approvers.push(this.pr.author);
    }

    return approvers;
  }

  /**
   * Builds a check-run.
   *
   * @param {!object} fileOwners ownership rules.
   * @return {CheckRun} a check-run based on the approval state.
   */
  buildCheckRun(fileOwners) {
    const passing = this._allFilesApproved(fileOwners);
    const text = this._buildOutputText(fileOwners);
    const summary = `The check was a ${passing ? 'success' : 'failure'}!`;
    return new CheckRun(summary, text);
  }

  /**
   * Tests if all files are approved by at least one owner.
   *
   * TODO(rcebulko): Replace legacy check-run code used by old Owner class.
   *
   * @private
   * @param {!object} fileOwners ownership rules.
   * @return {boolean} if all files are approved.
   */
  _allFilesApproved(fileOwners) {
    return Object.values(fileOwners)
      .map(fileOwner => fileOwner.owner.dirOwners)
      .every(dirOwners => !!_.intersection(dirOwners, this.approvers).length);
  }

  /**
   * Build the check-run output comment.
   *
   * TODO(rcebulko): Replace legacy check-run code used by old Owner class.
   *
   * @private
   * @param {!object} fileOwners ownership rules.
   * @return {string} check-run output text.
   */
  _buildOutputText(fileOwners) {
    const unapprovedFileOwners = Object.values(fileOwners).filter(
      fileOwner =>
        // Omit sections that has a required reviewer who has
        // approved.
        !_.intersection(this.approvers, fileOwner.owner.dirOwners).length
    );

    const reviewerSuggestions = unapprovedFileOwners.map(fileOwner => {
      const reviewers = fileOwner.owner.dirOwners.join(', ');
      const header = `## possible reviewers: ${reviewers}`;
      const files = fileOwner.files.map(file => ` - ${file.path}`);
      return [header, ...files].join('\n');
    });

    return reviewerSuggestions.join('\n\n');
  }
}

module.exports = {
  OwnersCheck,
  CheckRun,
};
