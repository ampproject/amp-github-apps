/**
 * Copyright 2021 The AMP HTML Authors. All Rights Reserved.
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

const {
  gitBranchCreationPoint,
  gitBranchName,
  gitCommitHash,
  gitDiffCommitLog,
  gitDiffStatMain,
  gitMergeBaseMain,
  shortSha,
} = require('./git');
const {ciPullRequestSha, isCiBuild} = require('./ci');
const {cyan, green} = require('kleur/colors');
const {execOrDie} = require('./exec');
const {log, logWithoutTimestamp} = require('./log');

/**
 * Execute a command and prints the time it took to run.
 *
 * @param {string} cmd command to execute.
 */
function timedExecOrDie(cmd) {
  const startTime = Date.now();
  if (isCiBuild()) {
    logWithoutTimestamp(`::group::${cmd}`);
  } else {
    log('Running', cyan(cmd) + '...');
  }
  execOrDie(cmd);
  if (isCiBuild()) {
    logWithoutTimestamp('::endgroup::');
  }
  const endTime = Date.now();
  const executionTime = endTime - startTime;
  const mins = Math.floor(executionTime / 60000);
  const secs = Math.floor((executionTime % 60000) / 1000);
  log(
    'Done running',
    cyan(cmd),
    'Total time:',
    green(mins + 'm ' + secs + 's')
  );
}

/**
 * Prints a summary of files changed by, and commits included in the PR.
 */
function printChangeSummary() {
  let sha;
  if (isCiBuild()) {
    log(
      `Latest commit from ${cyan('main')} included in this build:`,
      cyan(shortSha(gitMergeBaseMain()))
    );
    sha = ciPullRequestSha();
  } else {
    sha = gitCommitHash();
  }
  log(`Testing the following changes at commit ${cyan(shortSha(sha))}:\n`);
  logWithoutTimestamp(gitDiffStatMain());

  const branchCreationPoint = gitBranchCreationPoint();
  if (branchCreationPoint) {
    log(
      `Commit log since branch ${cyan(gitBranchName())} was forked from`,
      `${cyan('main')} at ${cyan(shortSha(branchCreationPoint))}:\n`
    );
    logWithoutTimestamp(gitDiffCommitLog() + '\n');
  }
}

module.exports = {
  timedExecOrDie,
  printChangeSummary,
};
