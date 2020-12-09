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

import {
  ERROR_ISSUE_ENDPOINT,
  ErrorMonitor,
  ServiceName,
} from './src/error_monitor';
import {ErrorIssueBot} from './src/bot';
import {
  ErrorList,
  ErrorReport,
  ServiceGroupType,
  TopIssueView,
} from 'error-monitoring';
import {StackdriverApi} from './src/stackdriver_api';
import {formatDate, linkifySource} from './src/utils';
import Mustache from 'mustache';
import express from 'express';
import fs from 'fs';
import querystring from 'querystring';
import statusCodes from 'http-status-codes';

const GITHUB_REPO = process.env.GITHUB_REPO || 'ampproject/amphtml';
const [GITHUB_REPO_OWNER, GITHUB_REPO_NAME] = GITHUB_REPO.split('/');
const ISSUE_REPO_NAME = process.env.ISSUE_REPO_NAME || GITHUB_REPO_NAME;
const GITHUB_ACCESS_TOKEN = process.env.GITHUB_ACCESS_TOKEN;
const PROJECT_ID = process.env.PROJECT_ID || 'amp-error-reporting';
const MIN_FREQUENCY = Number(process.env.MIN_FREQUENCY || 2500);
const ALL_SERVICES = 'ALL SERVICES';
const VALID_SERVICE_TYPES = [ALL_SERVICES].concat(Object.keys(ServiceName));
const MAX_TITLE_LENGTH = 80;
// In shifting from one repo to another for reporting error issues, linking an
// existing issue to a new error introduces some ambiguity. Rather than require
// the engineer to include which repo they are linking from (which, eventually,
// will almost always be the new one), we can make an intelligent inference
// about which repo the issue belongs to based on the issue number.
const LEGACY_ISSUE_REPO_START = 10000;

let errorListTemplate = '';
/** Renders the error list UI. */
function renderErrorList(viewData: ErrorList.ViewData): string {
  if (!errorListTemplate) {
    errorListTemplate = fs.readFileSync('./static/error-list.html').toString();
  }

  return Mustache.render(errorListTemplate, viewData);
}

let topIssuesTemplate = '';
/** Renders the top issue list. */
function renderTopIssues(issues: Array<TopIssueView>): string {
  if (!topIssuesTemplate) {
    topIssuesTemplate = fs.readFileSync('./static/top-issues.html').toString();
  }

  return Mustache.render(topIssuesTemplate, {issues});
}

const bot = new ErrorIssueBot(
  GITHUB_ACCESS_TOKEN,
  GITHUB_REPO_OWNER,
  GITHUB_REPO_NAME,
  ISSUE_REPO_NAME
);

const stackdriver = new StackdriverApi(PROJECT_ID);
const monitor = new ErrorMonitor(stackdriver, MIN_FREQUENCY, 40);

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
  seenInVersions?: string | Array<string>;
}): ErrorReport {
  if (firstSeen && dailyOccurrences && stacktrace && seenInVersions) {
    return {
      errorId,
      firstSeen: new Date(firstSeen),
      dailyOccurrences: Number(dailyOccurrences),
      stacktrace,
      seenInVersions: Array.isArray(seenInVersions)
        ? seenInVersions
        : [seenInVersions],
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
  const {errorId, linkIssue, preview} = errorReport;

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
    if (preview) {
      res.status(statusCodes.BAD_REQUEST);
      const issue = await bot.buildErrorIssue(parsedReport);
      res.json(issue);
    } else {
      const issueUrl = await bot.report(parsedReport);
      res.redirect(statusCodes.MOVED_TEMPORARILY, issueUrl);
      if (shouldLinkIssue) {
        stackdriver.setGroupIssue(errorId, issueUrl);
      }
    }
  } catch (errResp) {
    console.warn(errResp);
    res.status(errResp.status || statusCodes.INTERNAL_SERVER_ERROR);
    res.json(errResp);
  }
}

function createErrorReportUrl({errorId}: ErrorReport): string {
  const params = querystring.stringify({errorId, linkIssue: 1});
  return `${ERROR_ISSUE_ENDPOINT}?${params}`;
}

/** Provides monitor to list errors, optionally filtered by service type. */
function getLister(
  optServiceType?: string,
  optThreshold?: number,
  optNormalizedThreshold?: number
): ErrorMonitor {
  let lister = optNormalizedThreshold
    ? monitor.threshold(optNormalizedThreshold)
    : monitor;

  if (optServiceType && optServiceType !== ALL_SERVICES) {
    if (!(optServiceType in ServiceName)) {
      throw new Error(
        `Invalid service group "${optServiceType}"; must be one of ` +
          `"${VALID_SERVICE_TYPES.join('", "')}"`
      );
    }

    const serviceType: ServiceGroupType = optServiceType as ServiceGroupType;
    lister = lister.service(ServiceName[serviceType]);
  }

  return optThreshold ? lister.threshold(optThreshold) : lister;
}

/** Endpoint to trigger a scan for new frequent errors. */
export async function errorMonitor(
  req: express.Request,
  res: express.Response
): Promise<void> {
  try {
    const serviceType = (req.query.serviceType || '').toString().toUpperCase();
    res.json({issueUrls: await getLister(serviceType).monitorAndReport()});
  } catch (error) {
    res.status(statusCodes.INTERNAL_SERVER_ERROR);
    res.json({error: error.toString()});
  }
}

function viewData({
  serviceType,
  serviceTypeThreshold,
  normalizedThreshold,
  errorReports,
}: ErrorList.JsonResponse): ErrorList.ViewData {
  const serviceTypeList: Array<ErrorList.ServiceTypeView> = VALID_SERVICE_TYPES.map(
    name => ({
      name,
      formattedName:
        name === 'DEVELOPMENT'
          ? '1% / Opt-In'
          : name.charAt(0).toUpperCase() + name.substr(1).toLowerCase(),
      selected: name === serviceType,
    })
  );

  return {
    serviceType,
    serviceTypeThreshold,
    normalizedThreshold,
    currentServiceType: serviceTypeList.filter(({selected}) => selected)[0],
    serviceTypeList,
    errorReports: errorReports.map(
      ({
        errorId,
        firstSeen,
        dailyOccurrences,
        message,
        stacktrace,
        seenInVersions,
        createUrl,
      }: ErrorList.ErrorReportWithMeta): ErrorList.ErrorReportView => ({
        errorId,
        firstSeen: formatDate(new Date(firstSeen)),
        dailyOccurrences: dailyOccurrences.toLocaleString('en-US'),
        message,
        stacktrace: stacktrace.split('\n').map(linkifySource).join('\n'),
        seenInVersions,
        createUrl,
      })
    ),
  };
}

/** Diagnostic endpoint to list new untracked errors. */
export async function errorList(
  req: express.Request,
  res: express.Response
): Promise<void> {
  // The query may specify either an exact threshold (used as the actual value
  // when filtering results) or a normalizedThreshold (which is adjusted based
  // on the service type, if any). These allow two distinct use-cases:
  // - end-user sets a standard threshold and it automatically adjusts across
  //   service types
  // - end-user sets an exact threshold for the view they are on, and that is
  //   the value used to filter
  // If both are specified, the exact threshold takes precedence.
  const {json, threshold, normalizedThreshold} = req.query;
  // If a valid serviceType param is provided, such as "nightly" or
  // "production", filter to that service group.
  const serviceType = (req.query.serviceType || ALL_SERVICES)
    .toString()
    .toUpperCase();

  try {
    const lister = getLister(
      serviceType,
      Number(threshold),
      Number(normalizedThreshold)
    );
    const reports = await lister.newErrorsToReport();
    const errorList: ErrorList.JsonResponse = {
      serviceType,
      serviceTypeThreshold: Math.ceil(lister.minFrequency),
      normalizedThreshold: Math.ceil(lister.normalizedMinFrequency),
      errorReports: reports.map(report => {
        return {
          createUrl: createErrorReportUrl(report),
          message: report.stacktrace.split('\n', 1)[0],
          ...report,
        };
      }),
    };

    if (json) {
      res.json(errorList);
    } else {
      res.send(renderErrorList(viewData(errorList)));
    }
  } catch (error) {
    console.error(error);
    res.status(statusCodes.INTERNAL_SERVER_ERROR);
    res.json({error: error.toString()});
  }
}

/** List top N errors and their associated GitHub issues (for QA reports). */
export async function topIssueList(
  req: express.Request,
  res: express.Response
): Promise<void> {
  const n = Number(req.query.n || 10);
  const seenIssues = new Set();
  const issues = (await monitor.topTrackedErrors())
    .filter(({group}) => !!group.trackingIssues)
    .map(({group: {groupId, trackingIssues}, representative: {message}}) => {
      let [title] = message.split('\n');
      if (title.length > MAX_TITLE_LENGTH) {
        title = `${title.substr(0, MAX_TITLE_LENGTH - 1)}…`;
      }
      const issueUrl = trackingIssues[0].url;
      const [, issue] = issueUrl.split(/ampproject\/[\w-]+\/issues\//);
      const issueNumber = Number(issue);

      if (!issueNumber || seenIssues.has(issueNumber)) {
        return null;
      }
      seenIssues.add(issueNumber);

      return {title, errorId: groupId, issueUrl, issueNumber};
    })
    .filter(Boolean)
    .slice(0, n);

  res.send(renderTopIssues(issues));
}

/** Link an existing GitHub issue to an error report. */
export async function linkIssue(
  req: express.Request,
  res: express.Response
): Promise<void> {
  const {errorId, serviceType, normalizedThreshold} = req.query;
  let issueNumber = req.query.issueNumber.toString();

  if (issueNumber.startsWith('#')) {
    issueNumber = issueNumber.substr(1);
  }
  issueNumber = Number(issueNumber);

  try {
    const issueRepo =
      issueNumber >= LEGACY_ISSUE_REPO_START
        ? GITHUB_REPO_NAME
        : ISSUE_REPO_NAME;

    await Promise.all([
      bot.commentWithDupe(errorId.toString(), issueNumber),
      stackdriver.setGroupIssue(
        errorId.toString(),
        `https://github.com/${GITHUB_REPO_OWNER}/${issueRepo}/issues/${issueNumber}`
      ),
    ]);
  } catch (e) {
    console.error(e);
  } finally {
    res.redirect(
      `/?serviceType=${serviceType}&normalizedThreshold=${normalizedThreshold}`
    );
  }
}
