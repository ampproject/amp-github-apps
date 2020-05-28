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
import bodyParser from 'body-parser';
import express from 'express';
import moment from 'moment';
import path from 'path';
import rateLimit from 'express-rate-limit';

async function main(): Promise<void> {
  const connection: Connection = await createConnection({
    type: 'mysql',
    port: Number(process.env.DB_PORT),
    host: process.env.DB_HOST,
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
  const port = process.env.SERVER_PORT;

  app.use(function (req, res, next) {
    res.header(
      'Access-Control-Allow-Origin',
      `${process.env.CLIENT_URL}:${process.env.CLIENT_PORT}`,
    );
    res.header(
      'Access-Control-Allow-Headers',
      'Origin, X-Requested-With, Content-Type, Accept',
    );
    next();
  });

  app.use(bodyParser.json());

  if (process.env.NODE_ENV == 'production') {
    const DIST_DIR = path.resolve('dist');

    app.use(express.static(DIST_DIR));
    app.use(
      '/',
      rateLimit({
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: 100, // limit each IP to 100 requests per windowMs
      }),
    );

    app.get('/', async (req, res) => {
      res.sendFile(path.join(DIST_DIR, 'index.html'));
    });

    app.post('/insert/', async (req, res) => {
      // authorization
      const authorization = req.header('authorization');
      const auth = authorization.split(/Basic /i)[1];
      if (auth != process.env.BASIC_AUTH) {
        return res.status(401).json('Request is not authorized');
      }

      // parse ctime string into date
      const {release, promotions} = req.body;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const errors: any[] = [];

      if (release) {
        await repositoryService.createReleases(release).catch((error) => {
          errors.push(error);
        });
      }

      if (promotions) {
        promotions.forEach((p: {time: string; date: Date}) => {
          p.date = moment(p.time).toDate();
        });

        await repositoryService.createPromotions(promotions).catch((error) => {
          errors.push(error);
        });
      }

      // return database errors if any
      if (errors.length > 0) {
        return res.status(500).json(errors);
      }

      // return success
      return res.status(200).json('Successfully updated the database');
    });
  }

  app.get('/promotions/', async (req, res) => {
    const releases = await repositoryService.getPromotions();
    res.json(releases);
  });

  app.get('/releases/:release', async (req, res) => {
    const release = await repositoryService.getRelease(req.params.release);
    res.json(release);
  });

  app.get('/current-promotions/', async (req, res) => {
    const releases = await repositoryService.getCurrentPromotions();
    res.json(releases);
  });

  app.get('/releases/', async (req, res) => {
    const releases = await repositoryService.getReleases();
    res.json(releases);
  });

  app.listen(port, () => {
    console.log(`App listening on port: ${port}`);
  });
}
main();
