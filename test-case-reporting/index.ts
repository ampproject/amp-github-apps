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

require('dotenv').config();

import {Database, dbConnect} from './src/db';
import {TestResultRecord} from './src/test_result_record';
import {Travis} from 'test-case-reporting';
import express from 'express';

const app = express();
const PORT = process.env.PORT || 8080;

app.get('/', (req, res) => {
  res.send('Hello, world, 2.0!');
});

app.get('/test-results/pr/:prNumber', (req, res) => {
  const {prNumber} = req.params;
  res.send(`List of test cases for PR number ${prNumber}`);
});

app.get('/test-results/history/:testCaseId', (req, res) => {
  const {testCaseId} = req.params;
  res.send(`Test history for test with name/ID ${testCaseId}`);
});

app.post('/report', async (req, res) => {
  const db: Database = dbConnect();
  const testResultRecord = new TestResultRecord(db);

  const report: Travis.Report = req.body;

  try {
    await testResultRecord.storeTravisReport(report);
    res.send(`Travis report stored successfully!`);
  } catch (e) {
    res.send(`Failed to send Travis report.`);
  }
});

app.listen(PORT, () => {
  console.log(`Running at http://localhost:${PORT}`);
});

export {app};
