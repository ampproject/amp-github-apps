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

import {GraphQLResponse} from 'error-monitoring';
import {graphql} from '@octokit/graphql';

const GRAPHQL_FREQ_MS = parseInt(process.env.GRAPHQL_FREQ_MS, 10) || 100;

/** Returns a promise that resolves after a specified number of milliseconds. */
async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Wrapper around the GraphQL client providing built-in query rate-limiting.
 */
export class RateLimitedGraphQL {
  private ready: Promise<void> = Promise.resolve();
  private execute: (query: string) => Promise<GraphQLResponse>;

  constructor(token: string, private frequencyMs: number = GRAPHQL_FREQ_MS) {
    this.execute = async (query: string): Promise<GraphQLResponse> =>
      graphql(query, {headers: {authorization: `token ${token}`}}) as Promise<
        GraphQLResponse
      >;
  }

  async runQuery(query: string): Promise<GraphQLResponse> {
    return new Promise(resolve => {
      this.ready = this.ready
        .then(async () => this.execute(query))
        .then(resolve)
        .then(async () => sleep(this.frequencyMs));
    });
  }
}
