/**
 * Copyright 2019 The AMP HTML Authors. All Rights Reserved.
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

const MAX_PER_PAGE = 100;

/**
 * Maps the github json payload to a simpler data structure.
 */
class PullRequest {
  /**
   * Constructor.
   *
   * @param {number} number pull request number.
   * @param {string} author username of the pull request author.
   * @param {string} headSha SHA hash of the PR's HEAD commit.
   * @param {string} description pull request description.
   * @param {string} state pull request status.
   */
  constructor(number, author, headSha, description, state) {
    Object.assign(this, {number, author, headSha, description, state});
  }

  /**
   * Whether or not the pull request is open.
   *
   * @return {boolean} true if the pull request is open.
   */
  get isOpen() {
    return this.state.toLowerCase() === 'open';
  }

  /**
   * Initialize a Pull Request from a GitHub response data structure.
   *
   * @param {!object} res GitHub PullRequest response structure.
   * @return {!PullRequest} a pull request instance.
   */
  static fromGitHubResponse(res) {
    return new PullRequest(
      res.number,
      res.user.login.toLowerCase(),
      res.head.sha,
      res.body,
      res.state
    );
  }
}

/**
 * A a GitHub PR review.
 */
class Review {
  /**
   * Constructor.
   *
   * @param {string} reviewer username of the reviewer giving approval.
   * @param {string} state status of the review (ie. "approved" or not).
   * @param {!Date} submittedAt timestamp when the review was submitted.
   */
  constructor(reviewer, state, submittedAt) {
    Object.assign(this, {
      reviewer,
      submittedAt,
      _state: state.toLowerCase(),
    });
  }

  /** If the review is an approval */
  get isApproved() {
    return this._state === 'approved';
  }

  /** If the review is a comment */
  get isComment() {
    return this._state === 'commented';
  }

  /** If the review is a rejection */
  get isRejected() {
    return !(this.isApproved || this.isComment);
  }
}

/**
 * A GitHub organization team.
 */
class Team {
  /**
   * Constructor.
   *
   * @param {string} org GitHub organization the team belongs to.
   * @param {string} slug team name slug.
   */
  constructor(org, slug) {
    Object.assign(this, {org, slug, members: []});
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
    this.members = await github.getTeamMembers(this);
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
   * @param {string} owner GitHub repository owner.
   * @param {string} repository GitHub repository name.
   * @param {Logger} logger logging interface.
   */
  constructor(client, owner, repository, logger = console) {
    Object.assign(this, {client, owner, repository, logger});
    // Optionally allow for providing a separate user-authenticated client for
    // team @mention workarounds.
    this.user = this;
  }

  /**
   * Creates a GitHub API interface from a Probot request context.
   *
   * @param {!Context} context Probot request context.
   * @return {!GitHub} a GitHub API interface.
   */
  static fromContext(context) {
    const {repo, owner} = context.repo();
    return new GitHub(context.github, owner, repo, context.log);
  }

  /**
   * Adds the owner and repo name to an object.
   *
   * @param {?object} obj object to add fields to.
   * @return {{repo: string, owner: string}} object with owner and repo set.
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
   * @param {string} method HTTP request method.
   * @param {string} url API endpoint URL path (ie. `/repos`).
   * @param {*} data optional request data.
   * @return {*} the response.
   */
  async _customRequest(method, url, data) {
    const request = {
      headers: {
        authorization: `token ${process.env.GITHUB_ACCESS_TOKEN}`,
        // This accept header adds support for fetching members of nested teams.
        accept: 'application/vnd.github.hellcat-preview+json',
      },
      method,
      url,
      ...data,
    };

    return await this.client.request(request);
  }

  /**
   * Automatically fetch multiple pages from a GitHub endpoint
   *
   * @param {!object} target Octokit API target to call.
   * @param {!object} options options to pass to Octokit's paginate function.
   * @return {Array<*>} list of results.
   */
  async _paginate(target, options) {
    return await this.client.paginate(
      target.endpoint.merge(Object.assign({'per_page': MAX_PER_PAGE}, options))
    );
  }

  /**
   * Fetch all teams for the organization.
   *
   * @return {!Array<!Team>} list of teams.
   */
  async getTeams() {
    this.logger.info(`Fetching teams for organization '${this.owner}'`);

    const teamsList = await this._paginate(this.client.teams.list, {
      org: this.owner,
    });
    this.logger.debug('[getTeams]', teamsList);

    return teamsList.map(({slug}) => new Team(this.owner, slug));
  }

  /**
   * Fetch all members of a team.
   *
   * @param {!Team} team team to find members for.
   * @return {!Array<string>} list of member usernames.
   */
  async getTeamMembers(team) {
    this.logger.info(`Fetching team members for team ${team}`);

    const memberList = await this._paginate(
      this.client.teams.listMembersInOrg,
      {
        org: this.owner,
        'team_slug': team.slug,
      }
    );
    this.logger.debug('[getTeamMembers]', team, memberList);

    return memberList.map(({login}) => login.toLowerCase());
  }

  /**
   * Fetches a pull request.
   *
   * @param {number} number pull request number.
   * @return {!PullRequest} pull request instance.
   */
  async getPullRequest(number) {
    const response = await this.client.pulls.get(
      this.repo({
        'pull_number': number,
      })
    );
    return PullRequest.fromGitHubResponse(response.data);
  }

  /**
   * Retrives code reviews for a PR from GitHub.
   *
   * @param {number} number PR number.
   * @return {!Array<!Review>} the list of code reviews.
   */
  async getReviews(number) {
    this.logger.info(`Fetching reviews for PR #${number}`);

    const reviewList = await this._paginate(
      this.client.pulls.listReviews,
      this.repo({'pull_number': number})
    );
    this.logger.debug('[getReviews]', number, reviewList);

    // See https://developer.github.com/v4/enum/pullrequestreviewstate/ for
    // possible review states. The only ones we care about are "APPROVED" and
    // "CHANGES_REQUESTED", since the rest do not indicate a definite approval
    // or rejection.
    const allowedStates = ['approved', 'changes_requested', 'commented'];
    return reviewList
      .filter(({state}) => allowedStates.includes(state.toLowerCase()))
      .map(
        json =>
          new Review(
            json.user.login.toLowerCase(),
            json.state,
            new Date(json.submitted_at)
          )
      );
  }

  /**
   * Requests a review from GitHub users.
   *
   * @param {number} number PR number.
   * @param {!Array<string>} reviewers the list of usernames to request reviews from.
   */
  async createReviewRequests(number, reviewers) {
    if (!reviewers.length) {
      this.logger.warn(
        `Attempted to request reviews for PR ${number} ` +
          'but provided an empty username list'
      );
      return;
    }
    this.logger.info(
      `Requesting review for PR #${number} from: ${reviewers.join(', ')}`
    );

    await this.client.pulls.requestReviewers(
      this.repo({'pull_number': number, reviewers})
    );
  }

  /**
   * Retrieves code review requests for a PR from GitHub.
   *
   * @param {number} number PR number.
   * @return {!Array<string>} the list of code reviews.
   */
  async getReviewRequests(number) {
    this.logger.info(`Fetching review requests for PR #${number}`);

    const response = await this.client.pulls.listRequestedReviewers(
      this.repo({'pull_number': number})
    );
    this.logger.debug('[getReviewRequests]', number, response.data);

    return response.data.users.map(({login}) => login.toLowerCase());
  }

  /**
   * Retrieves PR comments by the bot user.
   *
   * Note that pull request comments fall under the Issues API, while comments
   * created via the Pulls API require a file path/position.
   *
   * @param {number} number PR number.
   * @return {!Array<{body: string, id: number}>} list of comments by the bot.
   */
  async getBotComments(number) {
    this.logger.info(`Fetching bot comments for PR #${number}`);

    const comments = await this._paginate(
      this.client.issues.listComments,
      this.repo({'issue_number': number})
    );
    this.logger.debug('[getBotComments]', number, comments);

    // GitHub appears to respond with the bot's username suffixed by `[bot]`,
    // though this doesn't appear to be documented anywhere. Since it's not
    // documented, rather than testing for that suffix explicitly, we just test
    // for the presence of the username and ignore whatever extras GitHub tacks
    // on.
    const regex = new RegExp(`\\b${process.env.GITHUB_BOT_USERNAME}\\b`);
    return comments
      .filter(({user}) => regex.test(user.login))
      .map(({id, body}) => {
        return {id, body};
      });
  }

  /**
   * Creates a comment on a PR.
   *
   * Note that pull request comments fall under the Issues API, while comments
   * created via the Pulls API require a file path/position.
   *
   * @param {number} number PR number.
   * @param {string} body comment body.
   * @return {Object} API response
   */
  async createBotComment(number, body) {
    this.logger.info(`Adding bot comment to PR #${number}`);
    this.logger.debug('[createBotComment]', number, body);

    const {data} = await this._customRequest(
      'POST',
      `/repos/${this.owner}/${this.repository}/issues/${number}/comments`,
      {body}
    );

    return data;
  }

  /**
   * Updates a comment on a PR.
   *
   * Note that pull request comments fall under the Issues API, while comments
   * created via the Pulls API require a file path/position.
   *
   * @param {number} commentId ID of comment to update.
   * @param {string} body comment body.
   * @return {Object} API response
   */
  async updateComment(commentId, body) {
    this.logger.info(`Replacing comment with ID ${commentId}`);
    this.logger.debug('[updateComment]', commentId, body);

    const {data} = await this._customRequest(
      'PATCH',
      `/repos/${this.owner}/${this.repository}/issues/comments/${commentId}`,
      {body}
    );

    return data;
  }

  /**
   * Fetches the contents of a file from GitHub.
   *
   * @param {!FileRef} file file ref to fetch.
   * @return {string} file contents as a string.
   */
  async getFileContents(file) {
    this.logger.info(
      `Fetching contents of file ${file.filename} at ref ${file.sha}`
    );

    const response = await this.client.git.getBlob(
      this.repo({'file_sha': file.sha})
    );
    this.logger.debug('[getFileContents]', file, response.data);

    return Buffer.from(response.data.content, 'base64').toString('utf8');
  }

  /**
   * Lists all modified files for a PR.
   *
   * @param {number} number PR number
   * @return {!Array<string>} list of relative file paths.
   */
  async listFiles(number) {
    this.logger.info(`Fetching changed files for PR #${number}`);

    const files = await this._paginate(
      this.client.pulls.listFiles,
      this.repo({'pull_number': number})
    );
    this.logger.debug('[listFiles]', number, files);

    return files.map(({filename}) => filename);
  }

  /**
   * Searches for files in a repo with a given name.
   *
   * See https://developer.github.com/v3/search/#search-code
   *
   * @param {string} filename filename to search for.
   * @return {!Array<!FileRef>} list of returned results.
   */
  async searchFilename(filename) {
    this.logger.info(`Searching repo for files named "${filename}"`);

    const files = await this._paginate(this.client.search.code, {
      q: `filename:${filename} repo:${this.owner}/${this.repository}`,
    });

    const ownersFiles = files
      .filter(({name}) => name === filename)
      .map(({path, sha}) => {
        return {filename: path, sha};
      });

    return Array.from(new Set(ownersFiles));
  }

  /**
   * Creates a check-run status for a commit.
   *
   * @param {string} sha commit SHA for HEAD ref to create check-run
   *     status on.
   * @param {!CheckRun} checkRun check-run data to create.
   */
  async createCheckRun(sha, checkRun) {
    this.logger.info(`Creating check-run for commit ${sha.substr(0, 7)}`);
    this.logger.debug('[createCheckRun]', sha, checkRun);

    return await this.client.checks.create(
      this.repo({
        'head_sha': sha,
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
   * @param {string} sha SHA hash for head commit to lookup check-runs on.
   * @return {!Object<string, number>} map from check names to check-run IDs.
   */
  async getCheckRunIds(sha) {
    this.logger.info(`Fetching check run ID for commit ${sha.substr(0, 7)}`);
    let checkRuns = [];

    try {
      const response = await this.client.checks.listForRef(
        this.repo({ref: sha})
      );
      checkRuns = response.data.check_runs;
    } catch (error) {
      this.logger.error(error);
      return {};
    }

    this.logger.debug('[getCheckRunIds]', sha, checkRuns);

    const checkRunIds = {};
    checkRuns
      .filter(cr => cr.head_sha === sha)
      .forEach(checkRun => {
        const checkName = checkRun.name.split('/')[1];
        // Always take the first matching result, since the response is in
        // most-recent-first order.
        if (!checkRunIds[checkName]) {
          checkRunIds[checkName] = checkRun.id;
        }
      });

    return checkRunIds;
  }

  /**
   * Updates the check-run status for a commit.
   *
   * @param {number} id ID of check-run data to update.
   * @param {!CheckRun} checkRun check-run data to update.
   */
  async updateCheckRun(id, checkRun) {
    this.logger.info(`Updating check-run with ID ${id} (${checkRun.summary})`);
    this.logger.debug('[updateCheckRun]', id, checkRun);

    return await this.client.checks.update(
      this.repo({
        'check_run_id': id,
        ...checkRun.json,
      })
    );
  }
}

module.exports = {GitHub, PullRequest, Review, Team};
