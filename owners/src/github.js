/**
 * Copyright 2016 Google Inc.
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

const {RepoFile} = require('./repo-file');
const {Owner} = require('./owner');
const _ = require('lodash');
const sleep = require('sleep-promise');

const GITHUB_CHECKRUN_DELAY = 2000;
const GITHUB_CHECKRUN_NAME = 'ampproject/owners-check';
const OWNERS_CHECKRUN_REGEX = /owners bot|owners-check/i;

/**
 * Interface for working with the GitHub API.
 */
class GitHub {
  /**
   * Constructor.
   *
   * @param {!GitHubAPI} client Probot GitHub client (see
   *     https://probot.github.io/api/latest/interfaces/githubapi.html).
   * @param {!string} owner GitHub repository owner.
   * @param {!string} repository GitHub repository name.
   * @param {!Logger} logger logging interface.
   */
  constructor(client, owner, repository, logger) {
    Object.assign(this, {client, owner, repository, logger});
  }

  /**
   * Creates a GitHub API interface from a Probot request context.
   *
   * @param {!Context} context Probot request context.
   * @return {GitHub} a GitHub API interface.
   */
  static fromContext(context) {
    const {repo, owner} = context.repo();
    return new GitHub(context.github, owner, repo, context.log);
  }

  /**
   * Adds the owner and repo name to an object.
   *
   * @param {?object} obj object to add fields to.
   * @return {object} object with owner and repo fields set.
   */
  repo(obj) {
    return Object.assign({}, obj, {repo: this.repository, owner: this.owner});
  }

  /**
   * Fetches a pull request.
   *
   * @param {!number} number pull request number.
   * @return {object} pull request JSON response.
   */
  getPullRequest(number) {
    // TODO: implement.
    return null;
  }

  /**
   * Retrives code reviews for a PR from GitHub.
   *
   * @param {!number} prNumber PR number.
   * @return {LegacyReview[]} the list of code reviews.
   */
  async getReviews(prNumber) {
    const response = await this.client.pullRequests.listReviews(
      this.repo({number: prNumber})
    );
    return response.data.map(
      json => new Review(json.user.login, json.state, json.submitted_at)
    );
  }

  /**
   * Lists all modified files for a PR.
   *
   * @param {!number} prNumber PR number
   * @return {string[]} list of relative file paths.
   */
  async listFiles(prNumber) {
    const response = await this.client.pullRequests.listFiles(
      this.repo({number: prNumber})
    );
    return response.data.map(item => item.filename);
  }

  /**
   * Creates a check-run status for a commit.
   *
   * @param {!string} branch branch name.
   * @param {!string} sha commit SHA for HEAD ref to create check-run
   *     status on.
   * @param {!CheckRun} checkRun check-run data to create.
   */
  async createCheckRun(branch, sha, checkRun) {
    return await this.client.checks.create(
      this.repo({
        head_branch: branch,
        head_sha: sha,
        ...checkRun.json,
      })
    );
  }

  /**
   * Fetches the ID of the OWNERS bot check-run for a commit.
   *
   * @param {!string} sha SHA hash for head commit to lookup check-runs on.
   * @return {number|null} check-run ID if one exists, otherwise null.
   */
  async getCheckRunId(sha) {
    const response = await this.client.checks.listForRef(this.repo({ref: sha}));
    const checkRuns = response.data.check_runs;
    const [checkRun] = checkRuns
      .filter(cr => cr.head_sha === sha)
      .filter(cr => OWNERS_CHECKRUN_REGEX.test(cr.name));
    return checkRun ? checkRun.id : null;
  }

  /**
   * Updates the check-run status for a commit.
   *
   * @param {!number} id ID of check-run data to update.
   * @param {!CheckRun} checkRun check-run data to update.
   */
  async updateCheckRun(id, checkRun) {
    return await this.client.checks.update(
      this.repo({
        check_run_id: id,
        ...checkRun.json,
      })
    );
  }
}

/**
 * Manages checking if a PR has the necessary approvals.
 */
class ApprovalCheck {
  /**
   * Builds a check-run.
   *
   * @param {!object} fileOwners ownership rules.
   * @param {!object} approvers list of usernames that approved this PR.
   * @return {CheckRun} a check-run based on the approval state.
   */
  static buildCheckRun(fileOwners, approvers) {
    const passing = this._allFilesApproved(fileOwners, approvers);
    const text = this._buildOutputText(fileOwners, approvers);
    return new CheckRun(passing, text);
  }

  /**
   * Tests if all files are approved by at least one owner.
   *
   * @private
   * @param {!object} fileOwners ownership rules.
   * @param {!string[]} approvers list of usernames that approved this PR.
   * @return {boolean} if all files are approved.
   */
  static _allFilesApproved(fileOwners, approvers) {
    return Object.values(fileOwners)
        .map(fileOwner => fileOwner.owner.dirOwners)
        .every(dirOwners => !!_.intersection(dirOwners, approvers).length);
  }

  /**
   * Build the check-run output comment.
   *
   * @private
   * @param {!object} fileOwners ownership rules.
   * @param {!string[]} approvers list of usernames that approved this PR.
   * @return {string} check-run output text.
   */
  static _buildOutputText(fileOwners, approvers) {
    const unapprovedFileOwners = Object.values(fileOwners)
      .filter(fileOwner =>
        // Omit sections that has a required reviewer who has approved.
        !_.intersection(approvers, fileOwner.owner.dirOwners).length)

    const reviewerSuggestions = unapprovedFileOwners
      .map((fileOwner) => {
        const reviewers = fileOwner.owner.dirOwners.join(', ');
        const header = `## possible reviewers: ${reviewers}`;
        const files = fileOwner.files.map(file => ` - ${file.path}`);
        return [header, ...files].join('\n');
      });

    return reviewerSuggestions.join('\n\n');
  }
}

/**
 * A GitHub presubmit check-run.
 */
class CheckRun {
  /**
   * Constructor.
   *
   * @param {!string} passing whether or not the check-run is passing/approved.
   * @param {!string} text description of check-run results.
   */
  constructor(passing, text) {
    Object.assign(this, {passing, text});
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
        summary: `The check was a ${this.passing ? 'success' : 'failure'}!`,
        text: this.text,
      },
    };
  }
}

/**
 * A a GitHub PR review.
 */
class Review {
  /**
   * Constructor.
   *
   * @param {!string} reviewer username of the reviewer giving approval.
   * @param {!string} state status of the review (ie. "approved" or not).
   * @param {!Date} submittedAt timestamp when the review was submitted.
   */
  constructor(reviewer, state, submittedAt) {
    Object.assign(this, {
      reviewer,
      submittedAt,
      isApproved: state.toLowerCase() === 'approved',
    });
  }
}

/**
 * Maps the github json payload to a simpler data structure.
 */
class PullRequest {
  /**
   * Constructor.
   *
   * @param {!GitHub} github GitHub API interface.
   * @param {!PullRequest} pr JSON object containing pull request info.
   * @param {Logger=} logger logging interface (defaults to console).
   */
  constructor(github, pr, logger) {
    this.logger = logger || console;
    this.github = github;

    this.id = pr.number;
    this.author = pr.user.login;

    // Ref here is the branch name
    this.headRef = pr.head.ref;
    this.headSha = pr.head.sha;
  }

  /**
   * Runs the steps to create a new check run on a newly opened Pull Request
   * on GitHub.
   */
  async processOpened() {
    const fileOwners = await Owner.getOwners(this);
    const approvers = await this.getApprovers();

    const checkRunId = await this.github.getCheckRunId(this.headSha);
    const latestCheckRun = ApprovalCheck.buildCheckRun(fileOwners, approvers);

    if (checkRunId) {
      await this.github.updateCheckRun(checkRunId, latestCheckRun);
    } else {
      // We need to add a delay on the PR creation and check creation since
      // GitHub might not be ready.
      // TODO: Verify this is still needed.
      await sleep(GITHUB_CHECKRUN_DELAY);
      await this.github.createCheckRun(
        this.headRef,
        this.headSha,
        latestCheckRun
      );
    }
  }

  /**
   * Retrieves the pull request json payload from the github API
   * and pulls out the files that have been changed in any way
   * and returns type RepoFile[].
   * @return {!Promise<!Array<!RepoFile>>}
   */
  async listFiles() {
    const files = await this.github.listFiles(this.id);
    return files.map(filename => new RepoFile(filename));
  }

  /**
   * Identifies all reviewers whose latest reviews are approvals.
   *
   * @return {string[]} list of usernames.
   */
  async getApprovers() {
    const reviews = await this.github.getReviews(this.id);
    // Sort by the latest submitted_at date to get the latest review.
    const sortedReviews = reviews.sort((a, b) => b.submittedAt - a.submittedAt);
    // This should always pick out the first instance.
    const uniqueReviews = _.uniqBy(sortedReviews, 'reviewer');
    const uniqueApprovals = uniqueReviews.filter(review => review.isApproved);
    const approvers = uniqueApprovals.map(approval => approval.reviewer);

    // The author of a PR implicitly gives approval over files they own.
    if (!approvers.includes(this.author)) {
      approvers.push(this.author);
    }

    return approvers;
  }

  /**
   * @param {!Array<string>} reviewers
   * @return {!Promise}
   */
  async setReviewers(reviewers) {
    // Stub
  }

  /**
   * @param {!GitHub} github GitHub API interface.
   * @param {number} number Pull Request number.
   * @return {object} JSON object representing a pull request.
   */
  static async get(github, number) {
    return await github.client.pullRequests.get(github.repo({number}));
  }
}

module.exports = {
  CheckRun,
  GitHub,
  PullRequest,
  Review,
};
