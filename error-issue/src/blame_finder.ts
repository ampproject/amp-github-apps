/**
 * Copyright 2020 The AMP HTML Authors. All Rights Reserved.
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

import {graphql} from '@octokit/graphql';

import {parsePrNumber} from './utils';
import {BlameRange, GraphQLResponse, ILogger, StackFrame} from './types';

/**
 * Service for looking up Git blame info for lines in a stacktrace.
 */
export class BlameFinder {
  // TODO(rcebulko): Use instance-level caching scheme.
  private files: {[key: string]: Array<BlameRange>} = {};

  constructor(
    private repoOwner: string,
    private repoName: string,
    private token: string,
    private logger: ILogger = console,
  ) {}

  /** Fetches the blame info for a file. */
  async blameForFile(ref: string, path: string): Promise<Array<BlameRange>> {
    const cacheKey = `${ref}:${path}`;
    if (cacheKey in this.files) {
      this.logger.info(`Returning blame for \`${cacheKey}\` from cache`);
      return this.files[cacheKey];
    }

    const queryRef = (ref: string): Promise<GraphQLResponse> => {
      this.logger.info(`Running blame query for \`${ref}:${path}\``);
      return graphql(
        `{
          repository(owner: "${this.repoOwner}", name: "${this.repoName}") {
            ref(qualifiedName: "${ref}") {
              target {
                # cast Target to a Commit
                ... on Commit {
                  blame(path: "${path}") {
                    ranges {
                      commit {
                        changedFiles
                        committedDate
                        messageHeadline
                        author {
                          user { login }
                        }
                      }
                      startingLine
                      endingLine
                    }
                  }
                }
              }
            }
          }
        }`,
          {headers: {authorization: `token ${this.token}`}}
        ) as Promise<GraphQLResponse>;
    };

    let {repository} = await queryRef(ref);
    // Use blame from `master` if the RTV/ref provided was invalid.
    if (!repository.ref) {
      repository = (await queryRef('master')).repository;
    }

    const {ranges} = repository.ref.target.blame;
    this.logger.debug(`Found ${ranges.length} blame ranges`);

    return this.files[cacheKey] = ranges
      .filter(({commit}) => commit.author.user)
      .map(({commit, startingLine, endingLine}) => ({
        path,
        startingLine,
        endingLine,

        author: commit.author.user.login,
        committedDate: new Date(commit.committedDate),
        changedFiles: commit.changedFiles,
        prNumber: parsePrNumber(commit.messageHeadline),
      }));
  }

  /** Fetches the blame range for a line of a file. */
  async blameForLine({rtv, path, line}: StackFrame) {
    const ranges = await this.blameForFile(rtv, path);
    for (const range of ranges) {
      if (range.startingLine <= line && range.endingLine >= line) {
        return range;
      }
    }

    throw new RangeError(`Unable to find line ${line} in blame for "${path}"`);
  }
}
