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
import {ErrorReport, ServiceGroupType} from 'error-issue-bot';
import {ServiceName} from './src/service_error_monitor';
import {StackdriverApi} from './src/stackdriver_api';
import express from 'express';
import statusCodes from 'http-status-codes';

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
const monitor = new ErrorMonitor(stackdriver, 2500, 40);

/** Constructs an error report from JSON, fetching details via API if needed. */
function errorReportFromJson({
  errorId,
  firstSeen,
  dailyOccurrences,
  stacktrace,
  seenInVersions,
}: {
  errorId: string;
  firstSeen?: string;
  dailyOccurrences?: string | number;
  stacktrace?: string;
  seenInVersions?: Array<string>;
}): ErrorReport {
  if (firstSeen && dailyOccurrences && stacktrace && seenInVersions) {
    return {
      errorId,
      firstSeen: new Date(firstSeen),
      dailyOccurrences: Number(dailyOccurrences),
      stacktrace,
      seenInVersions,
    };
  }

  throw new Error('Missing error report params');
}

/** Endpoint to create a GitHub issue for an error report. */
export async function errorIssue(
  req: express.Request,
  res: express.Response
): Promise<unknown> {
  const errorReport = req.method === 'POST' ? req.body : req.query;
  const {errorId, linkIssue} = errorReport;

  if (!errorId) {
    res.status(statusCodes.BAD_REQUEST);
    return res.send('Missing error ID param');
  }

  console.debug(`Processing http://go/ampe/${errorId}`);
  const shouldLinkIssue = linkIssue === '1';

  let parsedReport: ErrorReport;
  try {
    parsedReport = errorReportFromJson(errorReport);
  } catch {
    // If only an error ID is specified, fetch the details from the API.
    const groupStats = await stackdriver.getGroup(errorId);
    const {group} = groupStats;

    if (group.trackingIssues) {
      // If the error is already tracked, redirect to the existing issue
      return res.redirect(
        statusCodes.MOVED_TEMPORARILY,
        group.trackingIssues[0].url
      );
    }

    parsedReport = monitor.reportFromGroupStats(groupStats);
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

/** Provides monitor to list errors, optionally filtered by service type. */
function getLister(optServiceType?: string): ErrorMonitor {
  if (!optServiceType) {
    return monitor;
  }

  if (optServiceType in ServiceName) {
    const serviceType: ServiceGroupType = optServiceType as ServiceGroupType;
    return monitor.service(ServiceName[serviceType]);
  }

  throw new Error(
    `Invalid service group "${optServiceType}"; must be one of ` +
      `"${Object.keys(ServiceName).join('", "')}"`
  );
}

/** Diagnostic endpoint to list new untracked errors. */
export async function errorList(
  req: express.Request,
  res: express.Response
): Promise<void> {
  // If a valid serviceType param is provided, such as "nightly" or
  // "production", filter to that service group.
  const serviceType = (req.query.serviceType || '').toString().toUpperCase();

  try {
    const lister = getLister(serviceType);
    const reports = await lister.newErrorsToReport();

    res.json({
      serviceType: serviceType || 'ALL',
      serviceTypeThreshold: lister.minFrequency,
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
