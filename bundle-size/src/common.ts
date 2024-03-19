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

import type {Knex} from 'knex';

export interface StringCheckRow {
  head_sha: string;
  pull_request_id: string;
  installation_id: string;
  owner: string;
  repo: string;
  check_run_id: string;
  approving_teams: string;
  report_markdown: string;
}

export type CheckRow = Omit<
  StringCheckRow,
  'pull_request_id' | 'installation_id' | 'approving_teams' | 'check_run_id'
> & {
  pull_request_id: number;
  installation_id: number;
  approving_teams: string[];
  check_run_id: number;
};

/**
 * Get the GitHub Check object from the database.
 *
 * @param  db database connection.
 * @param headSha commit SHA of the head commit of a pull request.
 * @return GitHub Check object.
 */
export async function getCheckFromDatabase(
  db: Knex,
  headSha: string
): Promise<CheckRow | null> {
  const check = await db('checks')
    .first<StringCheckRow>(
      'head_sha',
      'pull_request_id',
      'installation_id',
      'owner',
      'repo',
      'check_run_id',
      'approving_teams',
      'report_markdown'
    )
    .where('head_sha', headSha);

  return check
    ? {
        ...check,
        check_run_id: Number(check.check_run_id),
        pull_request_id: Number(check.pull_request_id),
        installation_id: Number(check.installation_id),
        approving_teams: check.approving_teams
          ? check.approving_teams.split(',')
          : [],
      }
    : null;
}

/**
 * Format the bundle size delta in "Δ 99.99KB" format.
 *
 * Always fixed with 2 digits after the dot, preceded with a plus or minus sign.
 *
 * @param delta the bundle size delta in KB.
 * @return formatted bundle size delta.
 */
export function formatBundleSizeDelta(delta: number) {
  return 'Δ ' + (delta >= 0 ? '+' : '') + delta.toFixed(2) + 'KB';
}
