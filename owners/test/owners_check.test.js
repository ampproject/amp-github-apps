/**
 * Copyright 2019 The AMP HTML Authors.
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

const {CheckRun} = require('../src/owners_check');

describe('check run', () => {
  describe('json', () => {
    it('produces a JSON object in the GitHub API format', () => {
      const checkRun = new CheckRun(true, 'Test text');
      const checkRunJson = checkRun.json;

      expect(checkRunJson.name).toEqual('ampproject/owners-check');
      expect(checkRunJson.status).toEqual('completed');
      expect(checkRunJson.conclusion).toEqual('neutral');
      expect(checkRunJson.output.title).toEqual('ampproject/owners-check');
      expect(checkRunJson.output.text).toEqual('Test text');
    });

    it('produces a the output summary based on the passing status', () => {
      const passingCheckRun = new CheckRun(true, '');
      const failingCheckRun = new CheckRun(false, '');

      expect(passingCheckRun.json.output.summary).toEqual(
        'The check was a success!'
      );
      expect(failingCheckRun.json.output.summary).toEqual(
        'The check was a failure!'
      );
    });
  });
});
