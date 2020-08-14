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

import {Build, PageInfo, TestRun, Travis} from 'test-case-reporting';
import {TestCaseStats} from './src/test_case_stats';
import {TestResultRecord} from './src/test_result_record';
import {dbConnect} from './src/db';
import Mustache from 'mustache';
import bodyParser from 'body-parser';
import express from 'express';
import fs from 'fs';
import statusCodes from 'http-status-codes';

const MAX_PAGE_SIZE = 500;
const DEFAULT_PAGE_SIZE = 100;
const TEMPLATE_DIR = './static';

const app = express();
const jsonParser = bodyParser.json({limit: '15mb'});
const db = dbConnect();
const testCaseStats = new TestCaseStats(db);
const record = new TestResultRecord(db);

const templateCache: Record<string, string> = {};
function render(templateName: string, data: Record<string, unknown>): string {
  if (!templateCache[templateName]) {
    templateCache[templateName] = fs
      .readFileSync(`${TEMPLATE_DIR}/${templateName}.html`)
      .toString();
  }

  return Mustache.render(templateCache[templateName], data);
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
  const {limit = DEFAULT_PAGE_SIZE, offset = 0} = req.query;

  const limitNum = Math.min(parseInt(limit.toString()), MAX_PAGE_SIZE);
  const offsetNum = parseInt(offset.toString());

  return {
    limit: limitNum,
    offset: offsetNum,
  };
}

// We need the testRun index in mustache to give each collapsable
// its own id.
function enumerateTestRun(
  testRun: TestRun,
  index: number
): {testRun: TestRun; index: number} {
  return {testRun, index};
}

function lowerCaseStatus({status, ...rest}: TestRun): any {
  return {
    status: status.toLowerCase(),
    ...rest,
  };
}

app.use(express.static('static/css'));

app.get(['/', '/builds'], async (req, res) => {
  const {json} = req.query;

  try {
    const builds = await record.getRecentBuilds(extractPageInfo(req));

    if (json) {
      res.json({builds});
    } else {
      res.send(render('build-list', {title: 'Latest Builds', builds}));
    }
  } catch (error) {
    handleError(error, res);
  }
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
      res.send(
        render('test-run-list', {
          title: `Test Runs for Build #${buildNumber}`,
          testRuns: testRuns.map(lowerCaseStatus).map(enumerateTestRun),
        })
      );
    }
  } catch (error) {
    handleError(error, res);
  }
});

app.get('/test-cases/stats/:stat', async (req, res) => {
  const {stat} = req.params;
  const {json, count = 10} = req.query;

  try {
    const sampleSize = Number(count);

    if (Number.isNaN(sampleSize)) {
      throw new TypeError(
        `Expected a number for parameter 'count'; got ${count}`
      );
    }

    const testCases = await record.getTestCasesSortedByStat(
      sampleSize,
      stat,
      extractPageInfo(req)
    );

    if (json) {
      res.json({testCases});
    } else {
      res.send(
        render('test-case-list', {
          title: `Test cases with highest "${stat}"% in the past ${sampleSize} runs`,
          testCases,
        })
      );
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

    const testCaseName = testRuns ? testRuns[0].testCase.name : '';

    if (json) {
      res.json({testRuns});
    } else {
      res.send(
        render('test-run-list', {
          title: `Test Runs for test case "${testCaseName}"`,
          testRuns: testRuns.map(lowerCaseStatus).map(enumerateTestRun),
        })
      );
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

app.get('/_cron/compute-stats', async (req, res) => {
  const {count} = req.query;

  try {
    // This header is set by App Engine when running cron tasks, and is
    // stripped out of external requests.
    if (!req.header('X-Appengine-Cron') && process.env.NODE_ENV !== 'dev') {
      throw new Error('Attempted external request to a cron endpoint');
    }

    const sampleSize = Number(count);

    if (Number.isNaN(sampleSize)) {
      throw new TypeError('sampleSize is not a number');
    }

    await testCaseStats.updateStats(sampleSize);

    res.sendStatus(statusCodes.OK);
    console.log(`Computed pass/fail % for past ${count} runs`);
  } catch (error) {
    handleError(error, res);
  }
});

export {app};
