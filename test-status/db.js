/**
 * Copyright 2019, the AMP HTML authors
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

/**
 * Get the pull request snapshot object from its head SHA.
 *
 * @param {!Knex} db instantiated database connection.
 * @param {string} headSha SHA of a pull request's head commit.
 * @return {!Object} a pull request request snapshot information.
 */
exports.getPullRequestSnapshot = async (db, headSha) => {
  return await db('pull_request_snapshots')
      .first(
          ['head_sha', 'owner', 'repo', 'pull_request_id', 'installation_id'])
      .where({head_sha: headSha});
};

/**
 * Get the check_run ID of the GitHub check created for a headSha+type combo.
 *
 * @param {!Knex} db instantiated database connection.
 * @param {string} headSha SHA of a pull request's head commit.
 * @param {string} type major tests type slug (e.g., unit, integration).
 * @param {string} subType sub tests type slug (e.g., saucelabs, single-pass).
 * @return {?number} the check run ID or null if not found.
 */
exports.getCheckRunId = async (db, headSha, type, subType) => {
  const existingCheck = await db('checks')
      .first('check_run_id')
      .where({
        head_sha: headSha,
        type,
        subType,
      });
  if (existingCheck === undefined) {
    return null;
  } else {
    return existingCheck.check_run_id;
  }
};

/**
 * Get the full results of the GitHub check created for a headSha+type combo.
 *
 * @param {!Knex} db instantiated database connection.
 * @param {string} headSha SHA of a pull request's head commit.
 * @param {string} type major tests type slug (e.g., unit, integration).
 * @param {string} subType sub tests type slug (e.g., saucelabs, single-pass).
 * @return {?number} the full check results or null if not found.
 */
exports.getCheckRunResults = async (db, headSha, type, subType) => {
  const existingCheck = await db('checks')
      .join('pull_request_snapshots',
          'checks.head_sha', 'pull_request_snapshots.head_sha')
      .first([
        'checks.head_sha', 'type', 'subType', 'check_run_id', 'passed',
        'failed', 'errored', 'owner', 'repo', 'pull_request_id',
        'installation_id',
      ])
      .where({
        'checks.head_sha': headSha,
        type,
        'checks.subType': subType,
      });
  if (existingCheck === undefined) {
    return null;
  } else {
    if (typeof existingCheck.errored === 'number') {
      existingCheck.errored = Boolean(existingCheck.errored);
    }
    return existingCheck;
  }
};
