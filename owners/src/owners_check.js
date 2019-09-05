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
const {ReviewerSelection} = require('./reviewer_selection');

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
   * Runs the owners check and, if necessary, the reviewer selection algorithm.
   *
   * @return {CheckRun} a GitHub check-run with approval and reviewer info.
   */
  async run() {
    try {
      if (!this.initialized) {
        await this.init();
      }

      const fileTreeMap = this.tree.buildFileTreeMap(this.changedFiles);
      const coverageText = this.buildCurrentCoverageText(fileTreeMap);

      // Note: This starts removing files from the fileTreeMap that are already
      // approved, so we build the coverage text first.
      this.changedFiles.forEach(filename => {
        const subtree = fileTreeMap[filename];
        if (this._hasOwnersApproval(filename, subtree)) {
          delete fileTreeMap[filename];
        }
      });
      const passing = !Object.keys(fileTreeMap).length;
      const summary = `The check was a ${passing ? 'success' : 'failure'}!`;

      if (passing) {
        return new CheckRun(summary, coverageText);
      }

      const reviewSuggestions = ReviewerSelection.pickReviews(fileTreeMap);
      const suggestionsText = this.buildReviewSuggestionsText(
        reviewSuggestions
      );
      return new CheckRun(summary, `${coverageText}\n\n${suggestionsText}`);
    } catch (error) {
      // If anything goes wrong, report a failing check.
      return new CheckRun(
        'The check encountered an error!',
        'OWNERS check encountered an error:\n' + error
      );
    }
  }

  /**
   * Tests whether a file has been approved by an owner.
   *
   * Must be called after `init`.
   *
   * @param {!string} filename file to check.
   * @param {!OwnersTree} subtree nearest ownership tree to file.
   * @return {boolean} if the file is approved
   */
  _hasOwnersApproval(filename, subtree) {
    return this.approvers.some(approver =>
      this.tree.fileHasOwner(filename, approver)
    );
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
   * Build the check-run comment describing current approval coverage.
   *
   * @param {!FileTreeMap} fileTreeMap map from filenames to ownership subtrees.
   * @return {string} a list of files and which owners approved them, if any.
   */
  buildCurrentCoverageText(fileTreeMap) {
    const allFilesText = Object.entries(fileTreeMap)
      .map(([filename, subtree]) => {
        const fileApprovers = this.approvers.filter(approver =>
          this.tree.fileHasOwner(filename, approver)
        );

        if (fileApprovers.length) {
          return `- ${filename} (${fileApprovers.join(', ')})`;
        } else {
          return `- [NEEDS APPROVAL] ${filename}`;
        }
      })
      .join('\n');

    return `=== Current Coverage ===\n\n${allFilesText}`;
  }

  /**
   * Build the check-run comment suggesting a reviewer set.
   *
   * @param {!ReviewerFiles} reviewSuggestions suggested reviewer set.
   * @return {string} suggested reviewers and the files they could approve.
   */
  buildReviewSuggestionsText(reviewSuggestions) {
    const suggestionsText = reviewSuggestions.map(
      ([reviewer, coveredFiles]) => {
        const header = `Reviewer: ${reviewer}`;
        const files = coveredFiles.map(filename => `- ${filename}`);
        return [header, ...files].join('\n');
      }
    );

    return ['=== Suggested Reviewers ===', ...suggestionsText].join('\n\n');
  }
}

module.exports = {
  OwnersCheck,
  CheckRun,
};
