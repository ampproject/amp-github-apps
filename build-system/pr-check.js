/**
 * Copyright 2018 The AMP HTML Authors. All Rights Reserved.
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

const {APPS_TO_TEST, determineBuildTargets} = require('./build-targets');
const {cyan} = require('kleur/colors');
const {isPushBuild} = require('./ci');
const {log} = require('./log');
const {printChangeSummary, timedExecOrDie} = require('./utils');

/**
 * Set up and execute tests for an app.
 *
 * @param {string} appName
 */
function runAppTests(appName) {
  log('Testing the', cyan(appName), 'app...');
  timedExecOrDie(`cd ${appName} && npm ci --silent`);
  timedExecOrDie(`cd ${appName} && npm test -u`);
  log('Done testing', cyan(appName), '\n\n');
}

/**
 * Runs CI for AMP's github apps. For push builds, test all apps. For PR builds,
 * test only the apps that changed.
 */
function main() {
  if (isPushBuild()) {
    log('Running all tests because this is a push build...');
    APPS_TO_TEST.forEach(runAppTests);
  } else {
    printChangeSummary();
    determineBuildTargets().forEach(runAppTests);
  }
}

main();
