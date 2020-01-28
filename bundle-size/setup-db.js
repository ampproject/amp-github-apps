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

const log = require('fancy-log');
const {dbConnect} = require('./db');

/**
 * Setup up the database schema.
 *
 * @param {knex} db database handler.
 * @return {Promise<knex>} database handler.
 */
function setupDb(db) {
  return db.schema
    .createTable('checks', table => {
      table.string('head_sha', 40).primary();
      table.string('owner');
      table.string('repo');
      table.integer('pull_request_id');
      table.integer('installation_id');
      table.integer('check_run_id');
      table
        .string('approving_teams')
        .comment(
          'Comma separated list of teams to that can approve a bundle-size increase, in the format `ampproject/wg-runtime,ampproject/wg-performance`'
        );
    })
    .createTable('merges', table => {
      table.string('merge_commit_sha', 40).primary();
    });
}

module.exports = {setupDb};

/**
 * This file creates the database tables that will be used by the GitHub App.
 *
 * Execute this file by running `npm run setup-db`. Make sure you set up the
 * database connection first. See db-config.example.js for details.
 */
if (require.main === module) {
  const db = dbConnect();
  setupDb(db)
    .then(() => {
      log.info('Database tables created.');
    })
    .catch(error => {
      log.error(error.message);
    })
    .then(() => {
      db.destroy();
    });
}
