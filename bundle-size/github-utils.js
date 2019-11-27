/**
 * Copyright 2018, the AMP HTML authors
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
'use strict';

const NodeCache = require('node-cache');
const path = require('path');

const CACHE_CHECK_SECONDS = 60;
const CACHE_APPROVERS_KEY = 'approvers';
const CACHE_APPROVERS_TTL_SECONDS = 900;

/**
 * Get GitHub API parameters for bundle-size file actions.
 *
 * @param {string} filename the name of the file to act on.
 * @return {!object} GitHub API parameters to act on the file.
 */
function getBuildArtifactsFileParams_(filename) {
  return {
    owner: 'ampproject',
    repo: 'amphtml-build-artifacts',
    path: path.join('bundle-size', filename),
  };
}

/**
 * Utils for GitHub actions.
 */
class GitHubUtils {
  /**
   * @param {!github} github an authenticated GitHub API object.
   * @param {!Logger} log logging function/object.
   * @param {NodeCache} cache an optional NodeCache instance.
   */
  constructor(github, log, cache) {
    this.github = github;
    this.log = log;
    this.cache =
      cache ||
      new NodeCache({
        'stdTTL': CACHE_APPROVERS_TTL_SECONDS,
        'checkperiod': CACHE_CHECK_SECONDS,
      });
  }

  /**
   * Get a file from the bundle-size directory in the AMPHTML build artifacts
   * repository.
   *
   * @param {string} filename the name of the file to retrieve.
   * @return {string} the text contents of the file.
   */
  async getBuildArtifactsFile(filename) {
    return await this.github.repos
      .getContents(getBuildArtifactsFileParams_(filename))
      .then(result => Buffer.from(result.data.content, 'base64').toString());
  }

  /**
   * Store a file in the bundle-size directory in the AMPHTML build artifacts
   * repository.
   *
   * @param {string} filename the name of the file to store into.
   * @param {string} contents text contents of the file.
   */
  async storeBuildArtifactsFile(filename, contents) {
    await this.github.repos.createOrUpdateFile({
      ...getBuildArtifactsFileParams_(filename),
      message: `bundle-size: ${filename}`,
      content: Buffer.from(contents).toString('base64'),
    });
  }

  /**
   * Get the mapping of compiled files to their approvers and thresholds.
   * @return {!Map<string, {approvers: !Array<string>, threshold: number}>}
   *   mapping of compiled files to the teams that can approve an increase, and
   *   the threshold in KB that requires an approval.
   */
  async getFileApprovalsMapping() {
    let approvers = this.cache.get(CACHE_APPROVERS_KEY);
    if (!approvers) {
      this.log(
        `Cache miss for ${CACHE_APPROVERS_KEY}. Fetching from GitHub...`
      );
      approvers = await this.github.repos
        .getContents({
          owner: 'ampproject',
          repo: 'amphtml',
          path: 'build-system/tasks/bundle-size/APPROVERS.json',
        })
        .then(result => Buffer.from(result.data.content, 'base64').toString())
        .then(JSON.parse);
      this.log(
        `Fetched ${CACHE_APPROVERS_KEY} from GitHub with ` +
          `${Object.keys(approvers).length} entries. Caching for ` +
          `${CACHE_APPROVERS_TTL_SECONDS} seconds.`
      );
      this.cache.set(
        CACHE_APPROVERS_KEY,
        approvers,
        CACHE_APPROVERS_TTL_SECONDS
      );
    }
    return approvers;
  }

  /**
   * Get a random reviewer from the approved teams.
   *
   * @return {string} a username of someone who can approve a bundle size change.
   */
  async getRandomReviewer() {
    const reviewerTeamIds = process.env.REVIEWER_TEAMS.split('‚');
    const reviewerTeamId = parseInt(
      reviewerTeamIds[Math.floor(Math.random() * reviewerTeamIds.length)],
      10
    );

    const members = await this.github.teams
      .listMembers({
        team_id: reviewerTeamId,
      })
      .then(response => response.data);
    const member = members[Math.floor(Math.random() * members.length)];
    return member.login;
  }
}

module.exports = {GitHubUtils};
