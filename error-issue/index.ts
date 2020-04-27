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

require('dotenv').config();

import express from 'express';
import statusCodes from 'http-status-codes';
import {ErrorIssueBot} from './src/bot';
import {StackdriverApi} from './src/stackdriver_api';
import {ErrorMonitor, ERROR_ISSUE_ENDPOINT} from './src/error_monitor';
import {ErrorReport} from './src/types';

const GITHUB_REPO = process.env.GITHUB_REPO || 'ampproject/amphtml';
const [GITHUB_REPO_OWNER, GITHUB_REPO_NAME] = GITHUB_REPO.split('/');
const GITHUB_ACCESS_TOKEN = process.env.GITHUB_ACCESS_TOKEN;
const PROJECT_ID = process.env.PROJECT_ID || 'amp-error-reporting';

const bot = new ErrorIssueBot(
  GITHUB_ACCESS_TOKEN,
  GITHUB_REPO_OWNER,
  GITHUB_REPO_NAME
);

const stackdriver = new StackdriverApi(PROJECT_ID);
const monitor = new ErrorMonitor(stackdriver);
const lister = new ErrorMonitor(stackdriver, 2500, 40);

/** Endpoint to create a GitHub issue for an error report. */
export async function errorIssue(req: express.Request, res: express.Response) {
  const errorReport = req.method === 'POST' ? req.body : req.query;
  const {errorId, firstSeen, dailyOccurrences, stacktrace} = errorReport;

  if (!(errorId && firstSeen && dailyOccurrences && stacktrace)) {
    res.status(statusCodes.BAD_REQUEST);
    return res.send('Missing error report params');
  }

  console.debug(`Processing http://go/ampe/${errorId}`);
  const parsedReport: ErrorReport = {
    errorId,
    firstSeen: new Date(firstSeen),
    dailyOccurrences: parseInt(dailyOccurrences, 10),
    stacktrace,
  };

  try {
    const issueUrl = await bot.report(parsedReport);
    res.redirect(statusCodes.MOVED_TEMPORARILY, issueUrl);
  } catch (errResp) {
    console.warn(errResp);
    res.status(errResp.status || statusCodes.INTERNAL_SERVER_ERROR);
    res.set('Content-Type', 'application/json');
    res.send(JSON.stringify(errResp, null, 2));
  }
}

/** Endpoint to trigger a scan for new frequent errors. */
export async function errorMonitor(
  req: express.Request,
  res: express.Response
) {
  try {
    res.json({issueUrls: await monitor.monitorAndReport()});
  } catch (error) {
    res.status(statusCodes.INTERNAL_SERVER_ERROR);
    res.json({error: error.toString()});
  }
}

function createErrorReportUrl(report: ErrorReport) {
  const params = Object.entries(report)
    .map(([key, val]) => `${key}=${encodeURIComponent(val)}`)
    .join('&');

  return `${ERROR_ISSUE_ENDPOINT}?${params}`;
}

/** Diagnostic endpoint to list new untracked errors. */
export async function errorList(req: express.Request, res: express.Response) {
  try {
    const reports = await lister.newErrorsToReport();
    res.json({
      errorReports: reports.map(report => ({
        createUrl: createErrorReportUrl(report),
        ...report,
      })),
    });
  } catch (error) {
    res.status(statusCodes.INTERNAL_SERVER_ERROR);
    res.json({error: error.toString()});
  }
}
