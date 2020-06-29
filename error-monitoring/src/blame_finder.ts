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

import {
  BlameRange,
  GraphQLRef,
  GraphQLResponse,
  Logger,
  StackFrame,
} from 'error-monitoring';
import {RateLimitedGraphQL} from './rate_limited_graphql';
import {parseStacktrace} from './utils';

/**
 * Service for looking up Git blame info for lines in a stacktrace.
 */
export class BlameFinder {
  // TODO(rcebulko): Use instance-level caching scheme.
  private files: {[key: string]: Array<BlameRange>} = {};
  private graphql: (query: string) => Promise<GraphQLResponse>;

  constructor(
    private repoOwner: string,
    private repoName: string,
    client: RateLimitedGraphQL,
    private logger: Logger = console
  ) {
    this.graphql = async (query: string): Promise<GraphQLResponse> =>
      client.runQuery(query);
  }

  /** Fetches the blame info for a file. */
  async blameForFile(ref: string, path: string): Promise<Array<BlameRange>> {
    const cacheKey = `${ref}:${path}`;
    if (cacheKey in this.files) {
      this.logger.info(`Returning blame for \`${cacheKey}\` from cache`);
      return this.files[cacheKey];
    }

    const queryRef = async (ref: string): Promise<null | GraphQLRef> => {
      this.logger.info(`Running blame query for \`${ref}:${path}\``);

      try {
        const {repository}: GraphQLResponse = await this.graphql(
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
                          associatedPullRequests(first: 1) {
                            nodes { number }
                          }
                          author {
                            name
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
          }`
        );
        return repository.ref;
      } catch {
        return null;
      }
    };

    // Use blame from `master` if the RTV/ref provided was invalid.
    const targetRef = (await queryRef(ref)) || (await queryRef('master'));
    if (!targetRef) {
      // TODO(rcebulko): fix this if/when GitHub addresses the timeout issue.
      console.warn(`GitHub API timeout; skipping blame for ${path}`);
      return [];
    }

    const {ranges} = targetRef.target.blame;
    this.logger.debug(`Found ${ranges.length} blame ranges`);

    return (this.files[cacheKey] = ranges.map(
      ({commit, startingLine, endingLine}) => ({
        path,
        startingLine,
        endingLine,

        author: commit.author.user
          ? `@${commit.author.user.login}`
          : commit.author.name,
        committedDate: new Date(commit.committedDate),
        changedFiles: commit.changedFiles,
        prNumber: (commit.associatedPullRequests.nodes[0] || {}).number,
      })
    ));
  }

  /** Fetches the blame range for a line of a file. */
  async blameForLine({rtv, path, line}: StackFrame): Promise<BlameRange> {
    const ranges = await this.blameForFile(rtv, path);
    for (const range of ranges) {
      if (range.startingLine <= line && range.endingLine >= line) {
        return range;
      }
    }

    throw new RangeError(`Unable to find line ${line} in blame for "${path}"`);
  }

  /** Fetches the blame ranges for each line in a stacktrace. */
  async blameForStacktrace(stacktrace: string): Promise<Array<BlameRange>> {
    const stackFrames = parseStacktrace(stacktrace);
    // Note: The GraphQL client wrapper will handle debouncing API requests.
    const blames = [];
    for (const frame of stackFrames) {
      try {
        blames.push(await this.blameForLine(frame));
      } catch {
        // Ignore lines with no blame info.
      }
    }

    return blames.filter(({prNumber}) => prNumber);
  }
}
