/**
 * Copyright 2018, the AMP HTML authors. All Rights Reserved
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
'use strict';

const colors = require('ansi-colors');
const log = require('fancy-log');
const {ALL_TARGETS, determineBuildTargets} = require('./build-targets');
const {execOrDie} = require('./exec');
const {isTravisPushBuild} = require('./travis');

const FILENAME = 'pr-check.js';

/**
 * Execute a command, surrounded by start/end time logs.
 *
 * @param {string} cmd command to execute.
 */
function timedExecOrDie(cmd) {
  log.info('Running', colors.cyan(cmd), '...');
  execOrDie(cmd);
  log.info('Done running', colors.cyan(cmd), '...');
}

/**
 * Set up and execute tests for an app.
 *
 * TODO(#608): Replace this with gulp tasks.
 * TODO(#607): Adopt same logging standards as `amphtml`.
 *
 * @param {string} appName
 */
function runAppTests(appName) {
  log.info(`Running tests for "${appName}" app`);
  timedExecOrDie(`cd ${appName} && npm ci`);
  timedExecOrDie(`cd ${appName} && npm test -u`);
  log.info(`Done running "${appName}" tests`);
}

/**
 * Runs the checks.
 *
 * @return {number} process exit code.
 */
function main() {
  let buildTargets = new Set(ALL_TARGETS);

  if (isTravisPushBuild()) {
    log.info('Travis push build; running all tests');
  } else {
    buildTargets = determineBuildTargets(FILENAME);
    log.info(`Detected build targets: ${Array.from(buildTargets).join(', ')}`);
  }

  if (buildTargets.has('BUNDLE_SIZE')) {
    runAppTests('bundle-size');
  }
  if (buildTargets.has('INVITE')) {
    runAppTests('invite');
  }
  if (buildTargets.has('ERROR_ISSUE')) {
    runAppTests('error-issue');
  }
  if (buildTargets.has('OWNERS')) {
    runAppTests('owners');
  }
  if (buildTargets.has('ONDUTY')) {
    runAppTests('onduty');
  }
  if (buildTargets.has('PR_DEPLOY')) {
    runAppTests('pr-deploy');
  }
  if (buildTargets.has('RELEASE_CALENDAR')) {
    runAppTests('release-calendar');
  }
  if (buildTargets.has('TEST_STATUS')) {
    runAppTests('test-status');
  }

  return 0;
}

process.exit(main());
