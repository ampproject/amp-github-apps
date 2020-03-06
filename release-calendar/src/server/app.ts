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
import express from 'express';
import {createConnection, Connection} from 'typeorm';
import {addTestData} from '../../test/development-data';
import {ApiService} from './api-service';
import {Release} from './entities/release';

async function main(): Promise<void> {
  const connection = await createConnection({
    type: 'mysql',
    host: process.env.HOST,
    username: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    entities: [Release],
    synchronize: !JSON.parse(process.env.PRODUCTION), //recreate database schema on connect
    logging: false,
  }).catch(error => {
    throw error;
  }) as Connection; 

  const apiService = new ApiService(connection);
  const app = express();
  const port = process.env.API_PORT;

  app.use(function(req, res, next) {
    res.header('Access-Control-Allow-Origin', `http://localhost:${process.env.WEB_PORT}`);
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    next();
  });

  app.listen(port, () => {
    console.log(`Express server is listening on port: ${port}`);
  });
  
  app.get('/', async (req, res) => {
    const releases = await apiService.getReleases();
    res.json({items: releases });    
  });

  if (!JSON.parse(process.env.PRODUCTION)) {
    const savedReleases = await addTestData(connection);
    console.log(savedReleases);
  }
}
main();
