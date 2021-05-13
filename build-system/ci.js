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
'use strict';

/**
 * @fileoverview Provides CI state. (Only GH Actions until more is needed.)
 *
 * References:
 * GitHub Actions: https://docs.github.com/en/free-pro-team@latest/actions/reference/environment-variables#default-environment-variables
 */

/**
 * Shorthand to extract an environment variable.
 * @param {string} key
 * @return {string|undefined}
 */
function env(key) {
  return process.env[key];
}

/**
 * Returns true if this is a CI build.
 * @return {boolean}
 */
function isCiBuild() {
  return !!env('CI');
}

/**
 * Returns true if this is a PR build.
 * @return {boolean}
 */
function isPullRequestBuild() {
  return env('GITHUB_EVENT_NAME') === 'pull_request';
}

/**
 * Returns true if this is a push build.
 * @return {boolean}
 */
function isPushBuild() {
  return env('GITHUB_EVENT_NAME') === 'push';
}

/**
 * Returns the name of the PR branch.
 * @return {string}
 */
function ciPullRequestBranch() {
  return env('GITHUB_HEAD_REF');
}
/**
 * Returns the commit SHA being tested by a PR build.
 * @return {string}
 */
function ciPullRequestSha() {
  return require(env('GITHUB_EVENT_PATH')).pull_request.head.sha;
}

module.exports = {
  ciPullRequestBranch,
  ciPullRequestSha,
  isCiBuild,
  isPullRequestBuild,
  isPushBuild,
};
