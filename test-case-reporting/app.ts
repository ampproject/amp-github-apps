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

import {PageInfo, TestRun, Travis} from 'test-case-reporting';
import {TestResultRecord} from './src/test_result_record';
import {dbConnect} from './src/db';
import Mustache from 'mustache';
import bodyParser from 'body-parser';
import express from 'express';
import fs from 'fs';
import statusCodes from 'http-status-codes';

const MAX_PAGE_SIZE = 500;
const DEFAULT_PAGE_SIZE = 100;

const app = express();
const jsonParser = bodyParser.json({limit: '15mb'});
const db = dbConnect();
const record = new TestResultRecord(db);

let testRunListTemplate = '';
function renderTestRunList(testRuns: Array<TestRun>): string {
  if (!testRunListTemplate) {
    testRunListTemplate = fs
      .readFileSync('./static/test-run-list.html')
      .toString();
  }

  return Mustache.render(testRunListTemplate, {testRuns});
}

function handleError(error: Error, res: express.Response): void {
  console.warn(error);
  if (error instanceof TypeError) {
    // Request params are undefined or the wrong type
    res.status(statusCodes.BAD_REQUEST);
  } else {
    res.status(statusCodes.INTERNAL_SERVER_ERROR);
  }

  res.json({error: error.toString()});
}

function extractPageInfo(req: express.Request): PageInfo {
  const {limit, offset} = req.query;

  let limitNum = limit ? parseInt(limit.toString(), 10) : DEFAULT_PAGE_SIZE;
  const offsetNum = offset ? parseInt(offset.toString(), 10) : 0;

  if (limitNum > MAX_PAGE_SIZE) {
    limitNum = MAX_PAGE_SIZE;
    console.warn(
      `Maximum query size exceeded. Showing only first ${MAX_PAGE_SIZE} results.`
    );
  }

  return {
    limit: limitNum,
    offset: offsetNum,
  };
}

app.get('/', (req, res) => {
  res.send('Hello, world, 2.0!');
});

app.get('/test-results/build/:buildNumber', async (req, res) => {
  const {buildNumber} = req.params;
  const {json} = req.query;

  try {
    const testRuns = await record.getTestRunsOfBuild(
      buildNumber,
      extractPageInfo(req)
    );

    if (json) {
      res.json({testRuns});
    } else {
      res.send(renderTestRunList(testRuns));
    }
  } catch (error) {
    handleError(error, res);
  }
});

app.get('/test-results/history/:testCaseId', async (req, res) => {
  const {testCaseId} = req.params;
  const {json} = req.query;

  try {
    const testRuns = await record.getTestCaseHistory(
      testCaseId,
      extractPageInfo(req)
    );

    if (json) {
      res.json({testRuns});
    } else {
      res.send(renderTestRunList(testRuns));
    }
  } catch (error) {
    handleError(error, res);
  }
});

app.post('/report', jsonParser, async (req, res) => {
  const report: Travis.Report = req.body;
  const topLevelKeys: Array<keyof Travis.Report> = ['job', 'build', 'results'];

  try {
    for (const key of topLevelKeys) {
      if (!(report[key] as unknown)) {
        throw new TypeError(`Report payload must include ${key} property`);
      }
    }

    await record.storeTravisReport(report);
    res.sendStatus(statusCodes.CREATED);
  } catch (error) {
    handleError(error, res);
  }
});

export {app};
