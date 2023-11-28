/**
 * Copyright 2020 The AMP HTML Authors.
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

import dotenv from 'dotenv';
dotenv.config();

import {errorIssue, errorList, linkIssue, topIssueList} from './index';
import {json, urlencoded} from 'body-parser';
import express from 'express';

const PORT = Number(process.env.PORT || 8080);

console.log('⚙️ Configuring server');
const app = express()
  .use(json())
  .use(urlencoded({extended: false}))
  .get('/error-issue', errorIssue)
  .get(['/', '/error-list'], errorList)
  .get('/top-issues', topIssueList)
  .get('/link-issue', linkIssue);

console.log(`⌛ Starting server on port ${PORT}`);
app
  .listen(PORT)
  .on('listening', () => {
    console.log(`🏄 Server is listening on ${PORT}`);
  })
  .on('close', () => {
    console.log('🛑 Server is closed');
  });
