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

import {Connection, createConnection} from 'typeorm';
import {RepositoryService} from './repository-service';
import PromotionEntity from './entities/promotion';
import ReleaseEntity from './entities/release';
import express from 'express';

async function main(): Promise<void> {
  const connection: Connection = await createConnection({
    type: 'mysql',
    host: process.env.HOST,
    username: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    entities: [ReleaseEntity, PromotionEntity],
    synchronize: false,
    logging: false,
  }).catch((error) => {
    throw error;
  });

  const repositoryService = new RepositoryService(connection);
  const app = express();
  const port = process.env.API_PORT;

  app.use(function (req, res, next) {
    res.header(
      'Access-Control-Allow-Origin',
      `http://localhost:${process.env.WEB_PORT}`,
    );
    res.header(
      'Access-Control-Allow-Headers',
      'Origin, X-Requested-With, Content-Type, Accept',
    );
    next();
  });

  app.listen(port, () => {
    console.log(`Express server is listening on port: ${port}`);
  });

  app.get('/', async (req, res) => {
    const releases = await repositoryService.getReleases();
    res.json(releases);
  });

  app.get('/current-releases/', async (req, res) => {
    const releases = await repositoryService.getCurrentReleases();
    res.json(releases);
  });
}
main();
