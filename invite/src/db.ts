/**
 * Copyright 2020, the AMP HTML authors
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

require('dotenv').config();

import Knex from 'knex';

export type Database = Knex;
/** Connect to a database instance. */
export function dbConnect(): Database {
  return Knex({
    client: 'pg',
    connection: {
      host: process.env.DB_UNIX_SOCKET,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
    },
    useNullAsDefault: true,
  } as Knex.Config);
}
