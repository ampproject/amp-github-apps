/**
 * Copyright 2020 The AMP HTML Authors.
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

import {Octokit} from '@octokit/rest';

import {ILogger} from './types';

const trailingSlashRegExp = /\/$/;
const noTrailingSlash = (path: string) => path.replace(trailingSlashRegExp, '');

/** Interface for working with the GitHub API. */
export class GitHub {
  private pathContents: {[path: string]: Set<string>} = {};
  private pullFiles: {[pullNumber: number]: string[]} = {};

  constructor(
    private client: Octokit,
    private owner: string,
    private repo: string,
    private logger: ILogger = console
  ) {
    // Prevent throwing errors to handle status more easily.
    this.client.hook.error('request', async error => {
      const {status} = error;
      if (status === 404) {
        return {status};
      }
      throw error;
    });
  }

  /**
   * Finds a new directory added in a pull request, matching a regular
   * expression.
   * The regex result's first group should match the subdirectory at the level
   * where it wants to be found, so ^a/b/(foo)/x/y/z will look for foo/ in a/b/.
   * @return undefined or [filename, path, subdir]
   */
  async findNewDirectory(pullNumber: number, pathRegExp: RegExp) {
    for (const filename of await this.listPullFiles(pullNumber)) {
      const match = filename.match(pathRegExp);
      if (!match) {
        continue;
      }

      const [full, subdirTrailingSlash] = match;

      if (typeof subdirTrailingSlash !== 'string') {
        this.logger.error(
          'findNewDirectory: no group matched',
          pathRegExp,
          full
        );
        continue;
      }
      if (!filename.startsWith(full)) {
        this.logger.error(
          'findNewDirectory: match not at start (regex should start with ^)',
          pathRegExp,
          full
        );
        continue;
      }

      const subdir = noTrailingSlash(subdirTrailingSlash);
      const path = noTrailingSlash(full.substr(0, full.indexOf(`/${subdir}/`)));

      const contents = await this.getContents(path);
      if (contents && !contents.has(subdir)) {
        return [filename, path, subdir];
      }
    }
  }

  /**
   * Gets contents in path.
   * This is cached for looped lookups.
   */
  private async getContents(path: string): Promise<Set<string> | undefined> {
    if (path in this.pathContents) {
      return this.pathContents[path];
    }

    const {owner, repo} = this;
    const {status, data} = await this.client.repos.getContents({
      owner,
      repo,
      path,
    });

    if (status === 404) {
      return (this.pathContents[path] = new Set());
    }

    if (!Array.isArray(data)) {
      this.logger.error(path, 'is not a directory');
      return;
    }

    return (this.pathContents[path] = new Set(data.map(({name}) => name)));
  }

  /**
   * List files in a pull request.
   * This is cached for looped lookups.
   */
  private async listPullFiles(pullNumber: number): Promise<string[]> {
    if (pullNumber in this.pullFiles) {
      return this.pullFiles[pullNumber];
    }

    const {owner, repo} = this;
    const {data} = await this.client.pulls.listFiles({
      owner,
      repo,
      pull_number: pullNumber,
    });

    return (this.pullFiles[pullNumber] = data.map(({filename}) => filename));
  }

  /** Adds a comment. */
  async addComment(issueOrPullNumber: number, body: string) {
    const {owner, repo} = this;
    return this.client.issues.createComment({
      owner,
      repo,
      issue_number: issueOrPullNumber,
      body,
    });
  }

  /** Updates a pull request's description. */
  async updatePullBody(pullNumber: number, body: string) {
    const {owner, repo} = this;
    return this.client.pulls.update({
      owner,
      repo,
      pull_number: pullNumber,
      body,
    });
  }
}

module.exports = {GitHub};
