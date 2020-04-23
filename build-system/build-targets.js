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

const ALL_TARGETS = [
  'BUNDLE_SIZE',
  'CHECKLIST',
  'INVITE',
  'OWNERS',
  'PR_DEPLOY',
  'TEST_STATUS',
];

/**
 * A mapping of functions that match a given file to one or more build targets.
 */
const targetMatchers = [
  {
    targets: ['BUNDLE_SIZE'],
    func: file => file.startsWith('bundle-size/'),
  },
  {
    targets: ['CHECKLIST'],
    func: file => file.startsWith('checklist/'),
  },
  {
    targets: ['ERROR_ISSUE'],
    func: file => file.startsWith('error-issue/'),
  },
  {
    targets: ['INVITE'],
    func: file => file.startsWith('invite/'),
  },
  {
    targets: ['OWNERS'],
    func: file => file.startsWith('owners/'),
  },
  {
    targets: ['PR_DEPLOY'],
    func: file => file.startsWith('pr-deploy/'),
  },
  {
    targets: ['TEST_STATUS'],
    func: file => file.startsWith('test-status/'),
  },
];

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
    ALL_TARGETS.forEach(buildTargets.add, buildTargets);
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
  ALL_TARGETS,
  determineBuildTargets,
};
