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
 * @fileoverview
 * This script sets the build targets for our PR check, where the build targets
 * determine which tasks are required to run for pull request builds.
 */
const {bold, cyan, yellow} = require('ansi-colors');
const {gitDiffNameOnlyMaster} = require('./git');

const APPS_TO_TEST = [
  'bundle-size',
  'checklist',
  'error-monitoring',
  'invite',
  'onduty',
  'owners',
  'pr-deploy',
  'release-calendar',
  'test-status',
];

/**
 * A mapping of functions that match a given file to one or more build targets.
 */
const targetMatchers = APPS_TO_TEST.map(app => ({
  targets: [app],
  func: file => file.startsWith(`${app}/`),
}));

/**
 * Populates buildTargets with a set of build targets contained in a PR after
 * making sure they are valid. Used to determine which checks to perform / tests
 * to run during PR builds.
 * @param {string} fileName
 * @return {Set<string>}
 */
function determineBuildTargets(fileName = 'build-targets.js') {
  const filesChanged = gitDiffNameOnlyMaster();
  const buildTargets = new Set();

  targetMatchers
    .filter(matcher => filesChanged.some(matcher.func))
    .map(matcher => matcher.targets)
    .reduce((left, right) => left.concat(right), [])
    .forEach(buildTargets.add, buildTargets);

  if (buildTargets.size === 0) {
    // Default to running all test targets if no other targets are matched.
    APPS_TO_TEST.forEach(buildTargets.add, buildTargets);
  }

  const targetList = Array.from(buildTargets).sort().join(', ');
  console.log(
    bold(yellow(`${fileName}:`)),
    'Detected build targets:',
    cyan(targetList)
  );

  return buildTargets;
}

module.exports = {
  APPS_TO_TEST,
  determineBuildTargets,
};
