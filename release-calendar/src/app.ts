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

import {createConnection, Connection} from 'typeorm';
import {Release} from './entities/release';

async function main() {
  const connection = await createConnection({
    type: 'mysql',
    host: process.env.HOST,
    username: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    entities: [Release],
    synchronize: true, //
    logging: false,
  }).catch(error => {
    throw error;
  }) as Connection;


  const releaseRepo = connection.getRepository(Release);

  const release = new Release('1234567891234');
  await releaseRepo.save(release);

  const savedReleases = await releaseRepo.find();
  console.log(savedReleases);
}

main();
