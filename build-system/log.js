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

const fancyLog = require('fancy-log');
const {bold, yellow} = require('kleur/colors');

/**
 * Logs the given messages with an easy to spot prefix.
 */
function log(...messages) {
  const loggingPrefix = bold(yellow('pr-check'));
  fancyLog(loggingPrefix, ...messages);
}

module.exports = {
  log,
};
