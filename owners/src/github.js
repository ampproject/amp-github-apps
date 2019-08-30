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

const OWNERS_CHECKRUN_REGEX = /owners bot|owners-check/i;

/**
 * Maps the github json payload to a simpler data structure.
 */
class PullRequest {
  /**
   * Constructor.
   *
   * @param {!number} number pull request number.
   * @param {!string} author username of the pull request author.
   * @param {!string} headSha SHA hash of the PR's HEAD commit.
   */
  constructor(number, author, headSha) {
    Object.assign(this, {number, author, headSha});
  }

  /**
   * Initialize a Pull Request from a GitHub response data structure.
   *
   * @param {!object} res GitHub PullRequest response structure.
   * @return {PullRequest} a pull request instance.
   */
  static fromGitHubResponse(res) {
    return new PullRequest(res.number, res.user.login, res.head.sha);
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
   * @return {PullRequest} pull request instance.
   */
  async getPullRequest(number) {
    const response = await this.client.pullRequests.get(this.repo({number}));
    return PullRequest.fromGitHubResponse(response.data);
  }

  /**
   * Retrives code reviews for a PR from GitHub.
   *
   * @param {!number} number PR number.
   * @return {Review[]} the list of code reviews.
   */
  async getReviews(number) {
    this.logger.info(`Fetching reviews for PR #${number}`);

    const response = await this.client.pullRequests.listReviews(
      this.repo({number})
    );
    this.logger.debug('[getReviews]', number, response.data);

    return response.data.map(
      json => new Review(json.user.login, json.state, json.submitted_at)
    );
  }

  /**
   * Lists all modified files for a PR.
   *
   * @param {!number} number PR number
   * @return {string[]} list of relative file paths.
   */
  async listFiles(number) {
    this.logger.info(`Fetching changed files for PR #${number}`);

    const response = await this.client.pullRequests.listFiles(
      this.repo({number})
    );
    this.logger.debug('[listFiles]', number, response.data);

    return response.data.map(item => item.filename);
  }

  /**
   * Creates a check-run status for a commit.
   *
   * @param {!string} sha commit SHA for HEAD ref to create check-run
   *     status on.
   * @param {!CheckRun} checkRun check-run data to create.
   */
  async createCheckRun(sha, checkRun) {
    this.logger.info(`Creating check-run for commit ${sha.substr(0, 7)}`);
    this.logger.debug('[createCheckRun]', sha, checkRun);

    return await this.client.checks.create(
      this.repo({
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
    this.logger.info(`Fetching check run ID for commit ${sha.substr(0, 7)}`);

    const response = await this.client.checks.listForRef(this.repo({ref: sha}));
    const checkRuns = response.data.check_runs;
    this.logger.debug('[getCheckRunId]', sha, checkRuns);

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
    const status = checkRun.passing ? 'passing' : 'failing';
    this.logger.info(`Updating check-run with ID ${id} (${status})`);
    this.logger.debug('[updateCheckRun]', id, checkRun);

    return await this.client.checks.update(
      this.repo({
        check_run_id: id,
        ...checkRun.json,
      })
    );
  }
}

module.exports = {GitHub, PullRequest, Review};
