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
const EXAMPLE_OWNERS_LINK =
  'https://github.com/ampproject/amp-github-apps/blob/master/owners/OWNERS.example.yaml';

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
        text: `${this.text}\n\n${this.helpText}`,
      },
    };
  }
}
CheckRun.prototype.helpText =
  'For a description of the OWNERS.yaml file syntax, see ' +
  `[this example YAML file](${EXAMPLE_OWNERS_LINK}).`;

/**
 * Manages checking if a PR has the necessary approvals.
 */
class OwnersCheck {
  /**
   * Constructor.
   *
   * @param {!OwnersTree} tree file ownership tree.
   * @param {FileRef[]} changedFiles list of change files.
   * @param {!ReviewerApprovalMap} reviewers map of reviewer approval statuses.
   */
  constructor(tree, changedFiles, reviewers) {
    Object.assign(this, {
      tree,
      changedFilenames: changedFiles.map(({filename}) => filename),
      reviewers,
    });
  }

  /**
   * Runs the owners check and, if necessary, the reviewer selection algorithm.
   *
   * @return {OwnersCheckResult} a GitHub check-run and reviewers to add.
   */
  run() {
    try {
      const fileTreeMap = this.tree.buildFileTreeMap(this.changedFilenames);
      const coverageText = this.buildCurrentCoverageText(fileTreeMap);

      // Note: This starts removing files from the fileTreeMap that are already
      // approved, so we build the coverage text first.
      this.changedFilenames.forEach(filename => {
        const subtree = fileTreeMap[filename];
        if (this._hasOwnersApproval(filename, subtree)) {
          delete fileTreeMap[filename];
        }
      });
      const passing = !Object.keys(fileTreeMap).length;

      if (passing) {
        return {
          checkRun: new CheckRun(
            CheckRunConclusion.SUCCESS,
            'All files in this PR have OWNERS approval',
            coverageText
          ),
          reviewers: [],
        };
      }

      Object.entries(fileTreeMap).forEach(([filename, subtree]) => {
        if (this._hasOwnersPendingReview(filename, subtree)) {
          delete fileTreeMap[filename];
        }
      });
      const reviewSuggestions = ReviewerSelection.pickReviews(fileTreeMap);
      const reviewers = reviewSuggestions.map(([reviewer, files]) => reviewer);
      const suggestionsText = this.buildReviewSuggestionsText(
        reviewSuggestions
      );
      return {
        checkRun: new CheckRun(
          CheckRunConclusion.ACTION_REQUIRED,
          'Missing required OWNERS approvals! ' +
            `Suggested reviewers: ${reviewers.join(', ')}`,
          `${coverageText}\n\n${suggestionsText}`
        ),
        reviewers,
      };
    } catch (error) {
      // If anything goes wrong, report a failing check.
      return {
        checkRun: new CheckRun(
          CheckRunConclusion.NEUTRAL,
          'The check encountered an error!',
          'OWNERS check encountered an error:\n' + error
        ),
        reviewers: [],
      };
    }
  }

  /**
   * Tests whether a file has been approved by an owner.
   *
   * Must be called after `init`.
   *
   * @param {!string} filename file to check.
   * @param {!OwnersTree} subtree nearest ownership tree to file.
   * @param {boolean} isApproved approval status to filter by.
   * @return {boolean} if the file is approved.
   */
  _hasOwnersReview(filename, subtree, isApproved) {
    return Object.entries(this.reviewers)
      .filter(([username, approved]) => approved === isApproved)
      .map(([username, approved]) => username)
      .some(approver => this.tree.fileHasOwner(filename, approver));
  }

  /**
   * Tests whether a file has been approved by an owner.
   *
   * Must be called after `init`.
   *
   * @param {!string} filename file to check.
   * @param {!OwnersTree} subtree nearest ownership tree to file.
   * @return {boolean} if the file is approved.
   */
  _hasOwnersApproval(filename, subtree) {
    return this._hasOwnersReview(filename, subtree, true);
  }

  /**
   * Tests whether a file has been approved by an owner.
   *
   * Must be called after `init`.
   *
   * @param {!string} filename file to check.
   * @param {!OwnersTree} subtree nearest ownership tree to file.
   * @return {boolean} if the file is approved.
   */
  _hasOwnersPendingReview(filename, subtree) {
    return this._hasOwnersReview(filename, subtree, false);
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
        const reviewers = Object.entries(this.reviewers).filter(
          ([username, approved]) => this.tree.fileHasOwner(filename, username)
        );

        const approving = reviewers
          .filter(([username, approved]) => approved)
          .map(([username, approved]) => username);
        const pending = reviewers
          .filter(([username, approved]) => !approved)
          .map(([username, approved]) => username);

        if (approving.length) {
          return `- ${filename} _(${approving.join(', ')})_`;
        } else {
          let line = `- **[NEEDS APPROVAL]** ${filename}`;
          if (pending.length) {
            line += ` _(requested: ${pending.join(', ')})_`;
          }
          return line;
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
