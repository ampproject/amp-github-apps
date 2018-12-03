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

/**
 * This file creates the database table that will be used by the GitHub App.
 *
 * Execute this file by running `npm run setup-db`. Make sure you set up the
 * environment variable first. See .env.example for details.
 */

const db = require('./db').dbConnect();
db.schema.createTable('checks', table => {
  table.string('head_sha', 40).primary();
  table.string('base_sha', 40);
  table.string('owner');
  table.string('repo');
  table.integer('pull_request_id');
  table.integer('installation_id');
  table.integer('check_run_id');
  table.decimal('delta', 6, 2);
}).then(() => {
  log.info('Database table `checks` created.');
}).catch(error => {
  log.error(error.message);
}).then(() => {
  return db.destroy();
});
