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
 * @return {!object} a pull request request snapshot information.
 */
exports.getPullRequestSnapshot = async (db, headSha) => {
  return await db('pullRequestSnapshots')
    .first(['headSha', 'owner', 'repo', 'pullRequestId', 'installationId'])
    .where({headSha});
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
  const existingCheck = await db('checks').first('checkRunId').where({
    headSha,
    type,
    subType,
  });
  if (existingCheck === undefined) {
    return null;
  } else {
    return existingCheck.checkRunId;
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
    .join(
      'pullRequestSnapshots',
      'checks.headSha',
      'pullRequestSnapshots.headSha'
    )
    .first([
      'checks.headSha',
      'type',
      'subType',
      'checkRunId',
      'passed',
      'failed',
      'errored',
      'owner',
      'repo',
      'pullRequestId',
      'installationId',
    ])
    .where({
      'checks.headSha': headSha,
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

/**
 * Get the GitHub username of the current build cop.
 *
 * @param {!Knex} db instantiated database connection.
 * @return {string} the GitHub username of the current build cop.
 */
exports.getBuildCop = async db => {
  return await db('buildCop')
    .first('username')
    .then(row => row['username']);
};
