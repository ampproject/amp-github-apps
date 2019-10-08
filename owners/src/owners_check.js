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

const {OWNER_MODIFIER} = require('./owner');
const {ReviewerSelection} = require('./reviewer_selection');

const GITHUB_CHECKRUN_NAME = 'ampproject/owners-check';
const EXAMPLE_OWNERS_LINK =
  'https://github.com/ampproject/amp-github-apps/blob/master/owners/OWNERS.example';

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
  'For a description of the OWNERS file syntax, see ' +
  `[this example file](${EXAMPLE_OWNERS_LINK}).`;

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
        if (this._hasFullOwnersCoverage(filename, subtree)) {
          delete fileTreeMap[filename];
        }
      });
      const prHasFullOwnersCoverage = !Object.keys(fileTreeMap).length;
      const prHasReviewerSetApproval = this._prHasReviewerSetApproval();

      if (prHasFullOwnersCoverage && prHasReviewerSetApproval) {
        return {
          checkRun: new CheckRun(
            CheckRunConclusion.SUCCESS,
            'All files in this PR have OWNERS approval',
            coverageText
          ),
          reviewers: [],
        };
      } else if (prHasFullOwnersCoverage) {
        const reviewerSetText = this.buildReviewerSetText(
          this.tree.reviewerSetRule.owners
        );

        return {
          checkRun: new CheckRun(
            CheckRunConclusion.ACTION_REQUIRED,
            'Missing review from a member of the reviewer set',
            `${reviewerSetText}\n\n${coverageText}`
          ),
          reviewers: [],
        };
      }

      Object.entries(fileTreeMap).forEach(([filename, subtree]) => {
        if (this._hasOwnersPendingReview(filename, subtree)) {
          delete fileTreeMap[filename];
        }
      });

      // TODO(#516): Include missing required reviewers.
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
   * Tests whether a file has an owner in the reviewer set.
   *
   * Must be called after `init`.
   *
   * @param {!string} filename file to check.
   * @param {!OwnersTree} subtree nearest ownership tree to file.
   * @param {boolean} isApproved approval status to filter by.
   * @return {boolean} if the file is reviewed.
   */
  _hasOwnersReview(filename, subtree, isApproved) {
    return Object.entries(this.reviewers)
      .filter(([username, approved]) => approved === isApproved)
      .map(([username, approved]) => username)
      .some(approver => this.tree.fileHasOwner(filename, approver));
  }

  /**
   * Determines the set of missing required owners.
   *
   * Must be called after `init`.
   *
   * @param {!string} filename file to check.
   * @param {!OwnersTree} subtree nearest ownership tree to file.
   * @return {Owner[]} required owners that have not approved.
   */
  _missingRequiredOwners(filename, subtree) {
    return subtree
      .getModifiedFileOwners(filename, OWNER_MODIFIER.REQUIRE)
      .filter(
        owner => !owner.allUsernames.some(username => this.reviewers[username])
      );
  }

  /**
   * Tests whether a file has full owners coverage, including any required
   * reviewers.
   *
   * Must be called after `init`.
   *
   * @param {!string} filename file to check.
   * @param {!OwnersTree} subtree nearest ownership tree to file.
   * @return {boolean} if the file has approval coverage.
   */
  _hasRequiredOwnersApproval(filename, subtree) {
    return this._missingRequiredOwners(filename, subtree).length === 0;
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
  _hasFullOwnersCoverage(filename, subtree) {
    return (
      this._hasOwnersReview(filename, subtree, true) &&
      this._hasRequiredOwnersApproval(filename, subtree)
    );
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
   * Tests whether the PR has been approved by a member of the reviewer set, if
   * present.
   *
   * Must be called after `init`.
   *
   * @return {boolean} if the PR has reviewer approval.
   */
  _prHasReviewerSetApproval() {
    return Object.entries(this.reviewers)
      .filter(([username, approved]) => approved)
      .map(([username]) => username)
      .some(username =>
        this.tree.reviewerSetRule.owners.some(owner => owner.includes(username))
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
        const reviewers = Object.entries(this.reviewers).filter(
          ([username, approved]) => this.tree.fileHasOwner(filename, username)
        );

        const approving = reviewers
          .filter(([username, approved]) => approved)
          .map(([username, approved]) => username);
        const pending = reviewers
          .filter(([username, approved]) => !approved)
          .map(([username, approved]) => username);
        const missing = this._missingRequiredOwners(filename, subtree).map(
          owner => owner.name
        );

        if (approving.length && !missing.length) {
          return `- ${filename} _(${approving.join(', ')})_`;
        } else {
          let line = `- **[NEEDS APPROVAL]** ${filename}`;

          const names = [];
          if (pending.length) {
            names.push(`requested: ${pending.join(', ')}`);
          }
          if (missing.length) {
            names.push(`required: ${missing.join(', ')}`);
          }

          if (names.length) {
            line += ` _(${names.join('; ')})_`;
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

  /**
   * Build the check-run comment describing the need for a reviewer approval.
   *
   * @param {Owner[]} reviewers list of reviewer owners.
   * @return {string} explanation of reviewer set, if present.
   */
  buildReviewerSetText(reviewers) {
    return (
      'All PRs need approval from at least one member of the reviewer ' +
      `set: ${reviewers.join(', ')}`
    );
  }
}

module.exports = {
  OwnersCheck,
  CheckRun,
  CheckRunConclusion,
};
