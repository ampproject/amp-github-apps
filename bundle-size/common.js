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

/**
 * Get the GitHub Check object from the database.
 *
 * @param {!Knex} db database connection.
 * @param {string} headSha commit SHA of the head commit of a pull request.
 * @return {!object} GitHub Check object.
 */
exports.getCheckFromDatabase = async (db, headSha) => {
  const results = await db('checks')
    .select(
      'head_sha',
      'pull_request_id',
      'installation_id',
      'owner',
      'repo',
      'check_run_id',
      'delta'
    )
    .where('head_sha', headSha);
  if (results.length > 0) {
    return results[0];
  } else {
    return null;
  }
};

/**
 * Check whether the user is allowed to approve a bundle size change.
 *
 * @param {!github} github an authorized GitHub API object.
 * @param {string} username the username to check.
 * @return {boolean} true if the user is allowed to approve bundle size changes.
 */
exports.isBundleSizeApprover = async (github, username) => {
  // TODO(danielrozenberg): replace this logic with Promise.any when it exists.
  for (const teamId of process.env.APPROVER_TEAMS.split(',')) {
    try {
      await github.teams.getMembership({
        team_id: parseInt(teamId, 10),
        username,
      });
      return true;
    } catch (error) {
      // Ignore...
    }
  }
  return false;
};

/**
 * Format the bundle size delta in "Δ 99.99KB" format.
 *
 * Always fixed with 2 digits after the dot, preceded with a plus or minus sign.
 *
 * @param {number} delta the bundle size delta in KB.
 * @return {string} formatted bundle size delta.
 */
exports.formatBundleSizeDelta = delta => {
  return 'Δ ' + (delta >= 0 ? '+' : '') + delta.toFixed(2) + 'KB';
};
