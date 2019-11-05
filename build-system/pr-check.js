/**
 * Copyright 2018, the AMP HTML authors
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
const {execOrDie} = require('./exec');
const {isTravisPushBuild} = require('./travis');
const {determineBuildTargets} = require('./build-targets');
const log = require('fancy-log');

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
 * TODO(rcebulko): Replace this with gulp tasks.
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
  timedExecOrDie('eslint .');

  if (isTravisPushBuild()) {
    log.info('Travis push build; running all tests');
    ['bundle-size', 'owners', 'pr-deploy', 'test-status'].forEach(runAppTests);
  } else {
    const buildTargets = determineBuildTargets(FILENAME);
    ['bundle-size', 'owners', 'pr-deploy', 'test-status']
      .filter(buildTargets.has, buildTargets)
      .forEach(runAppTests);
    log.info(`Detected build targets: ${Array.from(buildTargets).join(', ')}`);
  }

  return 0;
}

process.exit(main());
