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

import {ERROR_ISSUE_ENDPOINT, ErrorMonitor} from './src/error_monitor';
import {ErrorIssueBot} from './src/bot';
import {ErrorReport} from 'error-issue-bot';
import {StackdriverApi} from './src/stackdriver_api';
import express from 'express';
import statusCodes from 'http-status-codes';

const {
  GITHUB_ORG = 'ampproject',
  CODE_REPO = 'amphtml',
  ISSUE_REPO = 'amphtml',
  PROJECT_ID = 'amp-error-reporting',
  GITHUB_ACCESS_TOKEN,
} = process.env;

const bot = new ErrorIssueBot(
  GITHUB_ACCESS_TOKEN,
  GITHUB_ORG,
  CODE_REPO,
  ISSUE_REPO
);

const stackdriver = new StackdriverApi(PROJECT_ID);
const monitor = new ErrorMonitor(stackdriver);
const lister = new ErrorMonitor(stackdriver, 2500, 40);

/** Endpoint to create a GitHub issue for an error report. */
export async function errorIssue(
  req: express.Request,
  res: express.Response
): Promise<unknown> {
  const errorReport = req.method === 'POST' ? req.body : req.query;
  const {
    errorId,
    firstSeen,
    dailyOccurrences,
    stacktrace,
    linkIssue,
  } = errorReport;

  if (!errorId) {
    res.status(statusCodes.BAD_REQUEST);
    return res.send('Missing error ID param');
  }

  console.debug(`Processing http://go/ampe/${errorId}`);
  const shouldLinkIssue = linkIssue === '1';

  let parsedReport: ErrorReport;
  if (firstSeen && dailyOccurrences && stacktrace) {
    parsedReport = {
      errorId,
      firstSeen: new Date(firstSeen),
      dailyOccurrences: Number(dailyOccurrences),
      stacktrace,
    };
  } else {
    // If only an error ID is specified, fetch the details from the API.
    const {
      group,
      timedCounts,
      firstSeenTime,
      representative,
    } = await stackdriver.getGroup(errorId);

    if (group.trackingIssues) {
      // If the error is already tracked, redirect to the existing issue
      return res.redirect(
        statusCodes.MOVED_TEMPORARILY,
        group.trackingIssues[0].url
      );
    }

    parsedReport = {
      errorId,
      firstSeen: firstSeenTime,
      dailyOccurrences: timedCounts[0].count,
      stacktrace: representative.message,
    };
  }

  try {
    const issueUrl = await bot.report(parsedReport);
    res.redirect(statusCodes.MOVED_TEMPORARILY, issueUrl);
    if (shouldLinkIssue) {
      stackdriver.setGroupIssue(errorId, issueUrl);
    }
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
): Promise<void> {
  try {
    res.json({issueUrls: await monitor.monitorAndReport()});
  } catch (error) {
    res.status(statusCodes.INTERNAL_SERVER_ERROR);
    res.json({error: error.toString()});
  }
}

function createErrorReportUrl(report: ErrorReport): string {
  const params = Object.entries(report)
    .map(([key, val]) => `${key}=${encodeURIComponent(val)}`)
    .join('&');

  return `${ERROR_ISSUE_ENDPOINT}?${params}`;
}

/** Endpoint to copy an issue from the issue repo to the code repo. */
export async function transferIssue(
  req: express.Request,
  res: express.Response
): Promise<void> {
  try {
    const {issueNumber} = req.method === 'POST' ? req.body : req.query;
    await bot.copyIssueToCodeRepo(Number(issueNumber));
    res.sendStatus(statusCodes.OK);
  } catch (error) {
    res.status(statusCodes.INTERNAL_SERVER_ERROR);
    res.json({error: error.toString()});
  }
}

/** Diagnostic endpoint to list new untracked errors. */
export async function errorList(
  req: express.Request,
  res: express.Response
): Promise<void> {
  try {
    const reports = await lister.newErrorsToReport();
    res.json({
      errorReports: reports.map(report => {
        const createUrl = createErrorReportUrl(report);
        return {
          createUrl,
          createAndLinkUrl: `${createUrl}&linkIssue=1`,
          ...report,
        };
      }),
    });
  } catch (error) {
    res.status(statusCodes.INTERNAL_SERVER_ERROR);
    res.json({error: error.toString()});
  }
}
