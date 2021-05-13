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

const {
  ciPullRequestBranch,
  ciPullRequestSha,
  isCiBuild,
  isPullRequestBuild,
} = require('./ci');
const {getStdout} = require('./exec');

/**
 * Shortens a commit SHA to 7 characters for human readability.
 * @param {string} sha 40 characters SHA.
 * @return {string} 7 characters SHA.
 */
function shortSha(sha) {
  return sha.substr(0, 7);
}

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

/**
 * Returns the commit hash of the latest commit.
 * @return {string}
 */
function gitCommitHash() {
  if (isPullRequestBuild()) {
    return ciPullRequestSha();
  }
  return getStdout('git rev-parse --verify HEAD').trim();
}

/**
 * Returns the list of files changed relative to the branch point off of the
 * main branch in diffstat format.
 * @return {string}
 */
function gitDiffStatMain() {
  const mainBaseline = gitMergeBaseMain();
  return getStdout(`git -c color.ui=always diff --stat ${mainBaseline}`);
}

/**
 * Returns the commit at which the current PR branch was forked off of the main
 * branch. During CI, there is an additional merge commit, so we must pick the
 * first of the boundary commits (prefixed with a -) returned by git rev-list.
 * On local branches, this is merge base of the current branch off of the main
 * branch.
 * @return {string}
 */
function gitBranchCreationPoint() {
  if (isPullRequestBuild()) {
    const prSha = ciPullRequestSha();
    return getStdout(
      `git rev-list --boundary ${prSha}...origin/main | grep "^-" | head -n 1 | cut -c2-`
    ).trim();
  }
  return gitMergeBaseMain();
}

/**
 * Returns the name of the branch from which the PR originated.
 * @return {string}
 */
function gitBranchName() {
  return isPullRequestBuild()
    ? ciPullRequestBranch()
    : getStdout('git rev-parse --abbrev-ref HEAD').trim();
}

/**
 * Returns a detailed log of commits included in a PR check, starting with (and
 * including) the branch point off of the main branch. Limited to commits in the
 * past 30 days to keep the output length manageable.
 *
 * @return {string}
 */
function gitDiffCommitLog() {
  const branchCreationPoint = gitBranchCreationPoint();
  const commitLog = getStdout(`git -c color.ui=always log --graph \
--pretty=format:"%C(red)%h%C(reset) %C(bold cyan)%an%C(reset) \
-%C(yellow)%d%C(reset) %C(reset)%s%C(reset) %C(green)(%cr)%C(reset)" \
--abbrev-commit ${branchCreationPoint}^...HEAD --since "30 days ago"`).trim();
  return commitLog;
}

module.exports = {
  gitBranchCreationPoint,
  gitBranchName,
  gitCommitHash,
  gitDiffCommitLog,
  gitDiffNameOnlyMain,
  gitDiffStatMain,
  gitMergeBaseMain,
  shortSha,
};
