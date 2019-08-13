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

const {dbConnect} = require('./db-connect');
const log = require('fancy-log');

/**
 * Setup up the database schema.
 *
 * @param {knex} db database handler.
 * @return {Promise<knex>} database handler.
 */
function setupDb(db) {
  return db.schema
    .createTable('pullRequestSnapshots', table => {
      table.comment('Snapshots of pull requests referenced by their head SHA');

      table.string('headSha', 40).primary();
      table.string('owner');
      table.string('repo');
      table.integer('pullRequestId');
      table
        .integer('installationId')
        .comment('Required to create checks (status lines) on GitHub');
    })
    .createTable('checks', table => {
      table.comment(
        'Checks (status lines) created on GitHub, referenced by ID'
      );

      table.string('headSha', 40);
      table.string('type', 255);
      table.string('subType', 255);
      table.integer('checkRunId');
      table.integer('passed');
      table.integer('failed');
      table.boolean('errored');

      table.primary(['headSha', 'type', 'subType']);
      table
        .foreign('headSha')
        .references('pullRequestSnapshots.headSha')
        .onDelete('CASCADE');
    })
    .createTable('buildCop', table => {
      table.comment(
        'Singleton table to store the GitHub username of active build cop'
      );

      table.string('username', 255);
    })
    .then(() => {
      return db('buildCop').insert({
        username: 'UNINITIALIZED',
      });
    });
}

module.exports = {setupDb};

/**
 * This file creates the database table that will be used by the GitHub App.
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
