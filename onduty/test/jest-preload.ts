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

// Allow the environment to override if desired.
process.env.LOG_LEVEL = process.env.LOG_LEVEL || 'warn';

process.env.GITHUB_ACCESS_TOKEN = '_TOKEN_';
process.env.GITHUB_ORG = 'test_org';
process.env.RELEASE_ONDUTY_TEAM = 'release-team';
process.env.BUILD_COP_TEAM = 'build-team';
process.env.AMP_RATE_LIMIT_MS = '1';
