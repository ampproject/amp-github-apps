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

import {Database, dbConnect} from './db';

/** Set up the database table. */
export async function setupDb(db: Database): Promise<unknown> {
  return db.schema.createTable('invites', table => {
    table.increments('id').primary();
    table.string('username', 40);
    table.string('repo', 100);
    table.integer('issue_number');
    table.string('action');
    table.boolean('archived').defaultTo(false);
  });
}

/**
 * This file creates the database tables to be used by the GitHub app.
 *
 * Execute this file by running `npm run setup-db`. Be sure to first configure
 * the database connection string in your `.env` entvironment file.
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
