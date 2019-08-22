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
    this.client = client;
    this.owner = owner;
    this.repository = repository;
    this.logger = logger;
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

  /**
   * Produces the JSON object used to create a check-run through the GitHub API.
   *
   * Check-run must have `branch` and `sha` properties defined.
   *
   * @return {object} JSON object for GitHub check-run creation.
   */
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
    this.state = pr.state;

    // Ref here is the branch name
    this.headRef = pr.head.ref;
    this.headSha = pr.head.sha;

    // Base is usually master
    this.baseRef = pr.base.ref;
    this.baseSha = pr.base.sha;
  }

  /**
   * Runs the steps to create a new check run on a newly opened Pull Request
   * on GitHub.
   */
  async processOpened() {
    const prInfo = await this.getMeta();
    // TODO: Reviewers here is to be assigned to the Pull Request.
    /* eslint-disable-next-line no-unused-vars */
    let reviewers = Object.values(prInfo.fileOwners).map(fileOwner => {
      return fileOwner.owner.dirOwners;
    });
    reviewers = _.union(...reviewers);
    const checkOutputText = this.buildCheckOutput(prInfo);
    const checkRunId = await this.github.getCheckRunId(this.headSha);
    const latestCheckRun = new CheckRun(prInfo.approvalsMet, checkOutputText);

    if (checkRunId) {
      await this.github.updateCheckRun(checkRunId, latestCheckRun);
    } else {
      // We need to add a delay on the PR creation and check creation since
      // GitHub might not be ready.
      // TODO: Verify this is still needed.
      await sleep(GITHUB_CHECKRUN_DELAY);
      await this.github.createCheckRun(
        this.headRef, this.headSha, latestCheckRun);
    }
  }

  /**
   * Retrieve the metadata we need to evaluate a Pull Request.
   */
  async getMeta() {
    const fileOwners = await Owner.getOwners(this);
    const reviews = await this.getUniqueReviews();
    this.logger.debug('[getMeta]', reviews);
    const approvalsMet = this.areAllApprovalsMet(fileOwners, reviews);
    const reviewersWhoApproved = this.getReviewersWhoApproved(reviews);
    return {fileOwners, reviews, approvalsMet, reviewersWhoApproved};
  }

  /**
   * Retrieves the pull request json payload from the github API
   * and pulls out the files that have been changed in any way
   * and returns type RepoFile[].
   * @return {!Promise<!Array<!RepoFile>>}
   */
  async listFiles() {
    const res = await this.github.client.pullRequests.listFiles({
      number: this.id,
      ...this.github.repo(),
    });
    this.logger.debug('[listFiles]', res.data);
    return res.data.map(item => new RepoFile(item.filename));
  }

  /**
   * Filters out duplicate reviews on a Pull Request. A Pull Request can be
   * reviewed by a single user multiple times (ex. disapproved then
   * subsequently approves.)
   *
   * @return {!Array<object>}
   */
  async getUniqueReviews() {
    const reviews = await this.getReviews();
    // This should always pick out the first instance.
    return _.uniqBy(reviews, 'username');
  }

  /**
   * Retrives the Reviews from GitHub.
   *
   * @return {!Array<object>}
   */
  async getReviews() {
    const res = await this.github.client.pullRequests.listReviews({
      number: this.id,
      ...this.github.repo(),
    });
    this.logger.debug('[getReviews]', res.data);
    // Sort by latest submitted_at date first since users and state
    // are not unique.
    const reviews = res.data
      .map(x => new Review(x))
      .sort((a, b) => {
        return b.submitted_at - a.submitted_at;
      });
    return reviews;
  }

  /**
   * @param {!Array<string>} reviewers
   * @return {!Promise}
   */
  async setReviewers(reviewers) {
    // Stub
  }

  /**
   * @param {object} fileOwners
   * @param {!Array<object>} reviews
   * @return {boolean}
   */
  areAllApprovalsMet(fileOwners, reviews) {
    const reviewersWhoApproved = this.getReviewersWhoApproved(reviews);
    return Object.keys(fileOwners).every(path => {
      const fileOwner = fileOwners[path];
      const owner = fileOwner.owner;
      _.intersection(owner.dirOwners, reviewersWhoApproved);
      return _.intersection(owner.dirOwners, reviewersWhoApproved).length > 0;
    });
  }

  /**
   * @param {!Array<object>} reviews
   * @return {!Array<object>}
   */
  getReviewersWhoApproved(reviews) {
    const reviewersWhoApproved = reviews
      .filter(x => {
        return x.state === 'approved';
      })
      .map(x => x.username);
    // If you're the author, then you yourself are assumed to approve your own
    // PR.
    reviewersWhoApproved.push(this.author);
    return reviewersWhoApproved;
  }

  /**
   * @param {object} prInfo
   * @return {string}
   */
  buildCheckOutput(prInfo) {
    const text = Object.values(prInfo.fileOwners)
      .filter(fileOwner => {
        // Omit sections that has a required reviewer who has
        // approved.
        return !_.intersection(
          prInfo.reviewersWhoApproved,
          fileOwner.owner.dirOwners
        ).length;
      })
      .map(fileOwner => {
        const fileOwnerHeader = `## possible reviewers: ${fileOwner.owner.dirOwners.join(
          ', '
        )}`;
        const files = fileOwner.files
          .map(file => {
            return ` - ${file.path}\n`;
          })
          .join('');
        return `\n${fileOwnerHeader}\n${files}`;
      })
      .join('');
    this.logger.debug('[buildCheckOutput]', text);
    return text;
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
/**
 * A Review action on a GitHub Pull Request. (approve, disapprove)
 */
class Review {
  /**
   * @param {object} json
   */
  constructor(json) {
    this.id = json.id;
    this.username = json.user.login;
    this.state = json.state.toLowerCase();
    this.submitted_at = new Date(json.submitted_at);
  }

  /**
   * @return {boolean}
   */
  isApproved() {
    return this.state == 'approved';
  }
}

module.exports = {
  CheckRun,
  GitHub,
  PullRequest,
  Review,
};
