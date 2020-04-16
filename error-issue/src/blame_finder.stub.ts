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

import {RateLimitedGraphQL} from './rate_limited_graphql.stub';
import {BlameRange, ILogger} from './types';

/**
 * Service for looking up Git blame info for lines in a stacktrace.
 */
export class BlameFinder {
  constructor(
    private repoOwner: string,
    private repoName: string,
    client: RateLimitedGraphQL,
    private logger: ILogger = console
  ) {}

  /** Fetches the blame ranges for each line in a stacktrace. */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async blameForStacktrace(stacktrace: string): Promise<Array<BlameRange>> {
    return [];
  }
}
