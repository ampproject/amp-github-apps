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

const {ReviewerSelection} = require('./reviewer_selection');

const GITHUB_CHECKRUN_NAME = 'ampproject/owners-check';

const CheckRunConclusion = {
  SUCCESS: 'success',
  FAILURE: 'failure',
  NEUTRAL: 'neutral',
  ACTION_REQUIRED: 'action_required',
};

/**
 * A GitHub presubmit check-run.
 */
class CheckRun {
  /**
   * Constructor.
   *
   * @param {!CheckRunConclusion} conclusion result of the check-run.
   * @param {!string} summary check-run summary text to show in PR.
   * @param {!string} text description of check-run results.
   */
  constructor(conclusion, summary, text) {
    Object.assign(this, {conclusion, summary, text});
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
      conclusion: this.conclusion,
      completed_at: new Date(),
      output: {
        title: this.summary,
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
   * @param {!OwnersTree} tree file ownership tree.
   * @param {string[]} approvers list of usernames of approving reviewers.
   * @param {string[]} changedFiles list of change files.
   */
  constructor(tree, approvers, changedFiles) {
    Object.assign(this, {tree, approvers, changedFiles});
  }

  /**
   * Runs the owners check and, if necessary, the reviewer selection algorithm.
   *
   * @return {CheckRun} a GitHub check-run with approval and reviewer info.
   */
  run() {
    try {
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

      if (passing) {
        return new CheckRun(
          CheckRunConclusion.SUCCESS,
          'All files in this PR have OWNERS approval',
          coverageText
        );
      }

      const reviewSuggestions = ReviewerSelection.pickReviews(fileTreeMap);
      const reviewers = reviewSuggestions
        .map(([reviewer, files]) => reviewer)
        .join(', ');
      const suggestionsText = this.buildReviewSuggestionsText(
        reviewSuggestions
      );
      return new CheckRun(
        CheckRunConclusion.ACTION_REQUIRED,
        `Missing required OWNERS approvals! Suggested reviewers: ${reviewers}`,
        `${coverageText}\n\n${suggestionsText}`
      );
    } catch (error) {
      // If anything goes wrong, report a failing check.
      return new CheckRun(
        CheckRunConclusion.NEUTRAL,
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
          return `- ${filename} _(${fileApprovers.join(', ')})_`;
        } else {
          return `- **[NEEDS APPROVAL]** ${filename}`;
        }
      })
      .join('\n');

    return `### Current Coverage\n\n${allFilesText}`;
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
        const header = `Reviewer: _${reviewer}_`;
        const files = coveredFiles.map(filename => `- ${filename}`);
        return [header, ...files].join('\n');
      }
    );

    return ['### Suggested Reviewers', ...suggestionsText].join('\n\n');
  }
}

module.exports = {
  OwnersCheck,
  CheckRun,
  CheckRunConclusion,
};
