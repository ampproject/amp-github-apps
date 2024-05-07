/**
 * Copyright 2018 The AMP HTML Authors. All Rights Reserved.
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

import path from 'node:path';

import NodeCache from 'node-cache';

import type {ApproversJsonContent} from './types/approvers-json-content';
import type {Logger} from 'probot';
import type {RestEndpointMethodTypes} from '@octokit/plugin-rest-endpoint-methods';
import type {RestfulOctokit} from './types/rest-endpoint-methods';

const CACHE_CHECK_SECONDS = 60;
const CACHE_APPROVERS_KEY = 'approvers';
const CACHE_APPROVERS_TTL_SECONDS = 900;
const CACHE_TEAM_MEMBERS_KEY = 'team_members';
const CACHE_TEAM_MEMBERS_TTL_SECONDS = 3600;

/**
 * Get GitHub API parameters for bundle-size file actions.
 *
 * @param filename the name of the file to act on.
 * @return GitHub API parameters to act on the file.
 */
function getBuildArtifactsFileParams_(filename: string) {
  return {
    owner: 'ampproject',
    repo: 'amphtml-build-artifacts',
    path: path.join('bundle-size', filename),
  };
}

/**
 * Utils for GitHub actions that are performed with a user-authenticated token.
 */
export class GitHubUtils {
  github: RestfulOctokit;
  log: Logger;
  cache: NodeCache;

  /**
   * @param github an authenticated GitHub API object.
   * @param log logging function/object.
   * @param cache an optional NodeCache instance.
   */
  constructor(github: RestfulOctokit, log: Logger, cache?: NodeCache) {
    this.github = github;
    this.log = log;
    this.cache = cache ?? new NodeCache({checkperiod: CACHE_CHECK_SECONDS});
  }

  /**
   * Get a file from the bundle-size directory in the AMPHTML build artifacts
   * repository.
   *
   * @param filename the name of the file to retrieve.
   * @return the text contents of the file.
   */
  async getBuildArtifactsFile(
    filename: string
  ): Promise<Record<string, number>> {
    const result = await this.github.rest.repos.getContent(
      getBuildArtifactsFileParams_(filename)
    );

    if (Array.isArray(result.data) || result.data.type !== 'file') {
      throw new Error(`Expected ${filename} to be a single file`);
    }

    return JSON.parse(Buffer.from(result.data.content, 'base64').toString());
  }

  /**
   * Store a file in the bundle-size directory in the AMPHTML build artifacts
   * repository.
   *
   * @param filename the name of the file to store into.
   * @param contents text contents of the file.
   */
  async storeBuildArtifactsFile(
    filename: string,
    contents: string
  ): Promise<void> {
    await this.github.rest.repos.createOrUpdateFileContents({
      ...getBuildArtifactsFileParams_(filename),
      message: `bundle-size: ${filename}`,
      content: Buffer.from(contents).toString('base64'),
    });
  }

  /**
   * Get the mapping of compiled files to their approvers and thresholds.
   *
   * @return mapping of compiled files to the teams that can approve an
   *   increase, and the threshold in KB that requires an approval.
   */
  async getFileApprovalsMapping(): Promise<ApproversJsonContent> {
    const cacheHit = this.cache.get<ApproversJsonContent>(CACHE_APPROVERS_KEY);
    if (cacheHit) {
      return cacheHit;
    }

    this.log.warn(
      `Cache miss for ${CACHE_APPROVERS_KEY}. Fetching from GitHub...`
    );
    const {data} = await this.github.rest.repos.getContent({
      owner: 'ampproject',
      repo: 'amphtml',
      path: 'build-system/tasks/bundle-size/APPROVERS.json',
    });

    if (Array.isArray(data) || data.type !== 'file') {
      throw new Error(
        'Expected build-system/tasks/bundle-size/APPROVERS.json to be a single file'
      );
    }

    const approvers = JSON.parse(
      Buffer.from(data.content, 'base64').toString()
    ) as ApproversJsonContent;

    this.log.info(
      `Fetched ${CACHE_APPROVERS_KEY} from GitHub with ` +
        `${Object.keys(approvers).length} entries. Caching for ` +
        `${CACHE_APPROVERS_TTL_SECONDS} seconds.`
    );
    this.cache.set(CACHE_APPROVERS_KEY, approvers, CACHE_APPROVERS_TTL_SECONDS);
    return approvers;
  }

  /**
   * Check whether the user is allowed to approve *all* bundle size changes.
   *
   * @param username the username to check.
   * @return true if the user is allowed to approve *all* bundle size
   *   changes.
   */
  async isSuperApprover(username: string): Promise<boolean> {
    const teamMembers = await this.getTeamMembers(
      process.env.SUPER_USER_TEAMS?.split(',') ?? []
    );
    return teamMembers.includes(username);
  }

  /**
   * Get a list of all unique team members by team names.
   *
   * @param teamNames list of GitHub team slugs. e.g.,
   *   ["ampproject/wg-coffee", "ampproject/wg-tea"].
   * @return all members of the provided teams.
   */
  async getTeamMembers(teamNames: string[]): Promise<string[]> {
    const allTeamMembersPromises = teamNames.map(async teamName => {
      const cacheKey = `${CACHE_TEAM_MEMBERS_KEY}/${teamName}`;
      const cacheHit = this.cache.get<string[]>(cacheKey);
      if (cacheHit) {
        return cacheHit;
      }

      this.log.warn(`Cache miss for ${cacheKey}. Fetching from GitHub...`);
      const [org, teamSlug] = teamName.split('/', 2);
      const {data} = await this.github.rest.teams.listMembersInOrg({
        org,
        team_slug: teamSlug,
      });
      const teamMembers = data.map(({login}) => login);
      this.log.info(
        `Fetched team members [${teamMembers.join(', ')}] for team ` +
          `${teamName}. Caching for ${CACHE_TEAM_MEMBERS_TTL_SECONDS} ` +
          'seconds.'
      );
      this.cache.set(cacheKey, teamMembers, CACHE_TEAM_MEMBERS_TTL_SECONDS);
      return teamMembers;
    }, this);

    const allTeamMembers = (await Promise.all(allTeamMembersPromises)).flat();
    return Array.from(new Set(allTeamMembers));
  }

  /**
   * Choose a random reviewer from list of potential approver teams.
   *
   * @param potentialReviewers list of GitHub usernames of all users who are
   *   members of the teams that can approve the bundle-size change of this pull
   *   request.
   * @return the chosen reviewer username.
   */
  async getRandomReviewer_(potentialReviewers: string[]) {
    return potentialReviewers[
      Math.floor(Math.random() * potentialReviewers.length)
    ];
  }

  /**
   * Choose a bundle size reviewer to add to the pull request.
   *
   * @param pullRequest GitHub Pull Request params.
   * @param approverTeams list of all the teams whose members can approve the
   *   bundle-size change of this pull request.
   * @return a new reviewer to add to the pull request or null if there is
   *   already a reviewer.
   */
  async chooseReviewer(
    pullRequest: RestEndpointMethodTypes['pulls']['listRequestedReviewers']['parameters'],
    approverTeams: string[]
  ): Promise<string | null> {
    const {data: listRequestedReviewersData} =
      await this.github.rest.pulls.listRequestedReviewers(pullRequest);
    const {data: listReviewsData} =
      await this.github.rest.pulls.listReviews(pullRequest);
    const existingReviewers = new Set<string>(
      [
        ...listRequestedReviewersData.users.map(user => user.login),
        ...listReviewsData.map(({user}) => user?.login),
      ]
        .filter(Boolean)
        .map(String)
    );

    const potentialReviewers = await this.getTeamMembers(approverTeams);
    if (potentialReviewers.some(existingReviewers.has, existingReviewers)) {
      this.log.info(
        `Reviewers set [${Array.from(existingReviewers).join(', ')}] of pull ` +
          `request ${pullRequest.pull_number} already contains an approver ` +
          `from potential approvers set [${potentialReviewers.join(', ')}]`
      );
      return null;
    }

    const newReviewer = await this.getRandomReviewer_(potentialReviewers);
    this.log.info(
      `Chose reviewer ${newReviewer} from all of ` +
        `[${potentialReviewers.join(', ')}] for pull request ` +
        `${pullRequest.pull_number}`
    );
    return newReviewer;
  }
}
