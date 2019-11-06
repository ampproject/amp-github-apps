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
 * @fileoverview Provides functions that extract various kinds of Travis state.
 */

/**
 * Returns true if this is a Travis build.
 * @return {boolean}
 */
function isTravisBuild() {
  return !!process.env.TRAVIS;
}

/**
 * Returns true if this is a Travis PR build.
 * @return {boolean}
 */
function isTravisPullRequestBuild() {
  return isTravisBuild() && process.env.TRAVIS_EVENT_TYPE === 'pull_request';
}

/**
 * Returns true if this is a Travis Push build.
 * @return {boolean}
 */
function isTravisPushBuild() {
  return isTravisBuild() && process.env.TRAVIS_EVENT_TYPE === 'push';
}

module.exports = {
  isTravisBuild,
  isTravisPullRequestBuild,
  isTravisPushBuild,
};
