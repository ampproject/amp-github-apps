/**
 * Copyright 2019, the AMP HTML authors
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

const fs = require('fs');
const path = require('path');

const nockRetryTimeoutMs = 100;
const nockMaxTimeoutMs = 10000;

/**
 * Get a JSON test fixture object.
 *
 * @param {!string} name name of the JSON fixture file (without .json).
 * @return {!object} the named JSON test fixture file.
 */
exports.getFixture = name => {
  return JSON.parse(
    fs.readFileSync(path.join(__dirname, `fixtures/${name}.json`))
  );
};

/**
 * Wait until the supplied nock Scope has all its network requests are satified.
 *
 * @param {!nock.Scope} nocks a nock Scope object with network expectations.
 */
exports.waitUntilNockScopeIsDone = async nocks => {
  const start = Date.now();
  while (Date.now() < start + nockMaxTimeoutMs && !nocks.isDone()) {
    await new Promise(resolve => setTimeout(resolve, nockRetryTimeoutMs));
  }
  nocks.done();
};
