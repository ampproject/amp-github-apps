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

require('dotenv').config();

import {Database, dbConnect} from './db';

const TIMESTAMP_PRECISION = 3;

/** Set up the database table. */
export async function setupDb(db: Database): Promise<unknown> {
  return db.schema
    .createTable('builds', table => {
      table.increments('id').primary();
      table.string('commit_sha', 40);
      table.string('build_number');
      table.timestamp('started_at', {precision: TIMESTAMP_PRECISION});
    })
    .createTable('jobs', table => {
      table.increments('id').primary();
      table
        .integer('build_id')
        .unsigned()
        .notNullable();
      table.string('job_number');
      table.string('test_suite_type');
      table.timestamp('started_at', {precision: TIMESTAMP_PRECISION});

      table.foreign('build_id').references('id').inTable('builds');
    })
    .createTable('test_cases', table => {
      table
        // MD5 hash of the name
        // table.string('id', 32) makes a varchar, which has poor performance when indexing.
        // Source for the performance claim:
        // https://dba.stackexchange.com/questions/2640/what-is-the-performance-impact-of-using-char-vs-varchar-on-a-fixed-size-field
        .specificType('id', 'char(32)')
        .notNullable()
        .primary()
        .comment('MD5 hash of the name');
      table.string('name');
      table
        .timestamp('created_at', {precision: TIMESTAMP_PRECISION})
        .defaultTo(db.fn.now());
    })
    .createTable('test_runs', table => {
      table.increments('id').primary();
      table
        .integer('job_id')
        .unsigned()
        .notNullable();
      table
        .specificType('test_case_id', 'char(32)')
        .notNullable();
      table.enu('status', ['PASS', 'FAIL', 'SKIP', 'ERROR'], {
        useNative: true,
        enumName: 'test_status',
      });
      table.timestamp('timestamp', {precision: TIMESTAMP_PRECISION});
      table.integer('duration_ms');

      table.foreign('test_case_id').references('id').inTable('test_cases');
      table
        .foreign('job_id')
        .references('id')
        .inTable('jobs');
    });
}

/**
 * This file creates the database tables to be used by the app.
 *
 * Execute this file by running `npm run setup-db`. Be sure to first configure
 * the database connection string in your `.env` environment file.
 */
if (require.main === module) {
  const db = dbConnect();

  setupDb(db)
    .then(() => {
      console.info('Database tables created');
    })
    .catch(error => {
      console.error(error.message);
    })
    .then(() => {
      db.destroy();
    });
}
