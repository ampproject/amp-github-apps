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

import log from 'fancy-log';

import {dbConnect, setupDb} from './db';

/**
 * This file creates the database tables that will be used by the GitHub App.
 *
 * Execute this file by running `npm run setup-db`. Make sure you set up the
 * database connection first in your .env file. See the .env.example file for
 * details.
 */
(async () => {
  const db = await dbConnect();
  try {
    await setupDb(db);
    log.info('Database tables created.');
  } catch (error) {
    log.error(error instanceof Error ? error.message : error);
  } finally {
    db.destroy();
  }
})();
