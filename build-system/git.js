/**
 * Copyright 2019 The AMP HTML Authors. All Rights Reserved.
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
'use strict';

/**
 * @fileoverview Provides functions that execute git commands.
 */

const {getStdout} = require('./exec');
const {isCiBuild} = require('./ci');

/**
 * Returns the merge base of the PR branch and the main branch. During CI on
 * GH actions, the main branch identifier is "origin/main".
 * @return {string}
 */
function gitMergeBaseMain() {
  const mainBranch = isCiBuild() ? 'origin/main' : 'main';
  return getStdout(`git merge-base ${mainBranch} HEAD`).trim();
}

/**
 * Returns the list of files changed relative to the branch point off of the
 * main branch, one on each line.
 * @return {!Array<string>}
 */
function gitDiffNameOnlyMain() {
  const mainBaseline = gitMergeBaseMain();
  return getStdout(`git diff --name-only ${mainBaseline}`).trim().split('\n');
}

module.exports = {
  gitDiffNameOnlyMain,
};
