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

import {parsePrNumber} from '../src/utils';

describe('parsePrNumber', () => {
  it('parses the PR number from a commit message', () => {
    const prNumber = parsePrNumber('Commit message from a PR (#12345)');
    expect(prNumber).toEqual(12345);
  });

  it('returns 0 when the commit message contains no PR number', () => {
    const prNumber = parsePrNumber('Direct commit to master branch');
    expect(prNumber).toEqual(0);
  });
});
