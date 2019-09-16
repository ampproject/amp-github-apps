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
 * A GitHub organization team.
 */
class Team {
  /**
   * Constructor.
   *
   * @param {!number} id team ID.
   * @param {!string} org GitHub organization the team belongs to.
   * @param {!string} slug team name slug.
   */
  constructor(id, org, slug) {
    Object.assign(this, {id, org, slug, members: []});
  }

  /**
   * Represent the team as a string.
   *
   * @return {string} the full organization-prefixed team name.
   */
  toString() {
    return `${this.org}/${this.slug}`;
  }

  /**
   * Gets the members of team.
   *
   * @param {!GitHubAPI} github GitHub API client.
   */
  async fetchMembers(github) {
    this.members = await github.getTeamMembers(this.id);
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
   * Issue a custom API request.
   *
   * Some endpoints are not fully supported by Octokit (the GitHub REST API
   * implementation),  so this method makes an arbitrary request with the
   * required headers.
   *
   * @param {!string} endpoint API endpoint URL path (ie. `/repos`).
   * @return {*} the response data.
   */
  async _customRequest(endpoint) {
    const response = await this.client.request({
      headers: {
        authorization: `token ${process.env.GITHUB_ACCESS_TOKEN}`,
        // This accept header adds support for fetching members of nested teams.
        accept: 'application/vnd.github.hellcat-preview+json',
      },
      url: endpoint,
    });

    return response;
  }

  /**
   * Fetch all teams for the organization.
   *
   * @return {Team[]} list of teams.
   */
  async getTeams() {
    this.logger.info(`Fetching teams for organization '${this.owner}'`);

    const teamsList = [];
    let pageNum = 0;
    let isNextLink = true;
    while (isNextLink) {
      const response = await this._customRequest(
        `/orgs/${this.owner}/teams?page=${pageNum}`
      );
      const nextLink = response.headers.link || '';
      isNextLink = nextLink.indexOf('rel="next"') !== -1;

      const teamPage = response.data;
      teamsList.push(...teamPage);
      pageNum++;
    }
    this.logger.debug('[getTeams]', teamsList);

    return teamsList.map(({id, slug}) => new Team(id, this.owner, slug));
  }

  /**
   * Fetch all members of a team.
   *
   * @param {!number} teamId ID of team to find members for.
   * @return {string[]} list of member usernames.
   */
  async getTeamMembers(teamId) {
    this.logger.info(`Fetching team members for team with ID ${teamId}`);

    const response = await this._customRequest(`/teams/${teamId}/members`);
    const memberList = response.data;
    this.logger.debug('[getTeamMembers]', teamId, memberList);

    return memberList.map(({login}) => login);
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
      json =>
        new Review(json.user.login, json.state, new Date(json.submitted_at))
    );
  }

  /**
   * Lists all modified files for a PR.
   *
   * @param {!number} number PR number
   * @return {FileRef[]} list of relative file paths.
   */
  async listFiles(number) {
    this.logger.info(`Fetching changed files for PR #${number}`);

    const response = await this.client.pullRequests.listFiles(
      this.repo({number})
    );
    this.logger.debug('[listFiles]', number, response.data);

    return response.data.map(({filename, sha}) => {
      return {filename, sha};
    });
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
   * If an error is encountered contacting the GitHub API, it will be logged and
   * will return `null`.
   *
   * @param {!string} sha SHA hash for head commit to lookup check-runs on.
   * @return {number|null} check-run ID if one exists, otherwise null.
   */
  async getCheckRunId(sha) {
    this.logger.info(`Fetching check run ID for commit ${sha.substr(0, 7)}`);
    let checkRuns;

    try {
      const response = await this.client.checks.listForRef(
        this.repo({ref: sha})
      );
      checkRuns = response.data.check_runs;
    } catch (error) {
      this.logger.error(error);
      return null;
    }

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
    this.logger.info(`Updating check-run with ID ${id} (${checkRun.summary})`);
    this.logger.debug('[updateCheckRun]', id, checkRun);

    return await this.client.checks.update(
      this.repo({
        check_run_id: id,
        ...checkRun.json,
      })
    );
  }
}

module.exports = {GitHub, PullRequest, Review, Team};
