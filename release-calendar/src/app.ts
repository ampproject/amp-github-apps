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
import 'reflect-metadata';
import {createConnection} from 'typeorm';
import {Release, Channel} from './entities/release';

async function main() {
  await createConnection({
    type: 'mysql',
    host: process.env.HOST,
    username: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    entities: [Release],
    synchronize: !JSON.parse(process.env.PRODUCTION), //recreate database schema on connect
    logging: false,
  })
    .then(async connection => {
      const releaseRepo = connection.getRepository(Release);

      const release1 = new Release(
        '1234567890123',
        Channel.LTS,
        false,
        new Date('2020-03-17T08:44:29+0100')
      );
      await releaseRepo.save(release1);
      const release2 = new Release(
        '2234567890123',
        Channel.STABLE,
        false,
        new Date('2020-03-12T08:44:29+0100')
      );
      await releaseRepo.save(release2);
      const release3 = new Release(
        '3234567890123',
        Channel.LTS,
        true,
        new Date('2020-03-10T08:44:29+0100')
      );
      await releaseRepo.save(release3);
      const release4 = new Release(
        '4234567890123',
        Channel.BETAONE,
        false,
        new Date('2020-03-16T08:44:29+0100')
      );
      await releaseRepo.save(release4);
      const release5 = new Release(
        '5234567890123',
        Channel.NIGHTLY,
        false,
        new Date('2020-03-14T08:44:29+0100')
      );
      await releaseRepo.save(release5);

      const savedReleases = await releaseRepo.find();
      console.log(savedReleases);
    })
    .catch(error => {
      throw error;
    });

}

main();
