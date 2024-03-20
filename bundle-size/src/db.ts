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

import knex, {type Knex} from 'knex';

export function dbConnect() {
  return knex({
    client: 'pg',
    // TODO(danielrozenberg): replace this with a database connection URL when
    // https://github.com/iceddev/pg-connection-string/pull/34 is merged.
    connection: JSON.parse(process.env.DATABASE_CONNECTION_JSON ?? 'null'),
  });
}

/**
 * Setup up the database schema.
 *
 * @param db database handler.
 */
export async function setupDb(db: Knex): Promise<void> {
  return db.schema
    .createTable('checks', table => {
      table.string('head_sha', 40).primary();
      table.string('owner');
      table.string('repo');
      table.integer('pull_request_id');
      table.integer('installation_id');
      table.bigInteger('check_run_id');
      table
        .text('approving_teams')
        .comment(
          'Comma separated list of teams to that can approve a bundle-size increase, in the format `ampproject/wg-runtime,ampproject/wg-performance`'
        );
      table
        .text('report_markdown')
        .comment('Markdown of the bundle size changes/missing files report');
    })
    .createTable('merges', table => {
      table.string('merge_commit_sha', 40).primary();
    });
}
