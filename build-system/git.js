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
 * @fileoverview Provides functions for executing various git commands.
 */

const {getStdout} = require('./exec');
const {isTravisBuild} = require('./travis');

/**
 * Returns the merge base of HEAD off of a given ref.
 *
 * @param {string} ref
 * @return {string}
 */
function gitMergeBase(ref) {
  return getStdout(`git merge-base ${ref} HEAD`).trim();
}

/**
 * Returns the `master` parent of the merge commit (current HEAD) on Travis.
 * Note: This is not the same as origin/master (a moving target), since new
 * commits can be merged while a Travis build is in progress.
 * See https://travis-ci.community/t/origin-master-moving-forward-between-build-stages/4189/6
 * @return {string}
 */
function gitTravisMasterBaseline() {
  return gitMergeBase('origin/master');
}

/**
 * Returns the merge base of the current branch off of master when running on
 * a local workspace.
 * @return {string}
 */
function gitMergeBaseLocalMaster() {
  return gitMergeBase('master');
}

/**
 * Returns the master baseline commit, regardless of running environment.
 * @return {string}
 */
function gitMasterBaseline() {
  return isTravisBuild()
    ? gitTravisMasterBaseline()
    : gitMergeBaseLocalMaster();
}

/**
 * Returns the list of files changed relative to the branch point off of master,
 * one on each line.
 * @return {!Array<string>}
 */
function gitDiffNameOnlyMaster() {
  const masterBaseline = gitMasterBaseline();
  return getStdout(`git diff --name-only ${masterBaseline}`).trim().split('\n');
}

module.exports = {
  gitDiffNameOnlyMaster,
};
