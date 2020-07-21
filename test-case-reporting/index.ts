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

import {KarmaReporter, TestRun, Travis} from 'test-case-reporting';
import {TestResultRecord} from './src/test_result_record';
import {dbConnect} from './src/db';
import express from 'express';
import statusCodes from 'http-status-codes';

const app = express();
const PORT = process.env.PORT || 8080;

const db = dbConnect();
const record = new TestResultRecord(db);

function renderTestRunList(testRuns: Array<TestRun>): string {
  return `Rendering ${testRuns.length} test runs!`;
}

app.get('/', (req, res) => {
  res.send('Hello, world, 2.0!');
});

app.get('/test-results/build/:buildNumber', async (req, res) => {
  const {buildNumber} = req.params;
  const {json} = req.query;
  const db = dbConnect();
  const testResultRecord = new TestResultRecord(db);

  const pageSize = 100;

  const testRunJson = {
    testRuns: await testResultRecord.getTestRunsOfBuild(buildNumber, {
      limit: pageSize,
      offset: 0,
    }),
  };

  if (json) {
    res.json(testRunJson);
  } else {
    res.send(renderTestRunList(testRunJson.testRuns));
  }
});

app.get('/test-results/history/:testCaseId', async (req, res) => {
  const {testCaseId} = req.params;
  const {json, limitStr, offsetStr} = req.query;
  const db = dbConnect();
  const testResultRecord = new TestResultRecord(db);

  let limit = parseInt(limitStr.toString(), 10);
  const offset = parseInt(offsetStr.toString(), 10);
  if (limit > 500) {
    limit = 500;
    console.warn(
      'WARNING: Maximum query size exceeded. Showing only first 500 results.'
    );
  }

  const testRunJson = {
    testRuns: await testResultRecord.getTestCaseHistory(testCaseId, {
      limit,
      offset,
    }),
  };

  if (json) {
    res.json(testRunJson);
  } else {
    res.send(renderTestRunList(testRunJson.testRuns));
  }
});

app.post('/report', async (req, res) => {
  try {
    const report: Travis.Report = req.body;
    const topLevelKeys: Array<keyof Travis.Report> = ['job', 'build', 'result'];

    for (const key of topLevelKeys) {
      if (!(report[key] as unknown)) {
        throw new TypeError(`Report payload must include ${key} property`);
      }
    }

    await record.storeTravisReport(report);
    res.sendStatus(statusCodes.CREATED);
  } catch (error) {
    console.warn(error);
    if (error instanceof TypeError) {
      // Missing top-level keys from the report.
      res.status(statusCodes.BAD_REQUEST);
    } else {
      res.status(statusCodes.INTERNAL_SERVER_ERROR);
    }

    res.json({error: error.toString()});
  }
});

app.listen(PORT, () => {
  console.log(`Running at http://localhost:${PORT}`);
});

export {app};
