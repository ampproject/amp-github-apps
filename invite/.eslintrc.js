/**
 * Copyright 2020 The AMP HTML Authors. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the 'License');
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an 'AS-IS' BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

const path = require('path');

module.exports = {
  extends: ['../.eslintrc-ts.js'],
  "parserOptions": {
    "project": path.resolve(__dirname, './tsconfig.json')
  },
  // Because of interactions with the GitHub API and the names of database
  // columns, it is cleanest to use `issue_number` throughout the codebase
  // instead of the camel-case equivalent. Snake-case is also required for
  // object parameters passed to Octokit invocations.
  "rules": {
    "@typescript-eslint/camelcase": "off"
  }
};
