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

import {StackdriverApi} from './stackdriver_api';
import {ErrorReport, Stackdriver} from './types';

import fetch from 'node-fetch';
import statusCodes from 'http-status-codes';

// const ERROR_ISSUE_REPORT_ENDPOINT = 'http://localhost:8080';
const ERROR_ISSUE_REPORT_ENDPOINT =
  'https://us-central1-amp-error-issue-bot.cloudfunctions.net/error-issue';

export class ErrorMonitor {
  constructor(
    private client: StackdriverApi,
    private minFrequency: number = 5000,
    private pageLimit: number = 25
  ) {}

  /** Tests if an error group already has an associated issue. */
  private hasTrackingIssue(group: Stackdriver.ErrorGroup) {
    return !!group.trackingIssues;
  }

  /** Tests if an error group is occurring frequently enough to report. */
  private hasHighFrequency(groupStats: Stackdriver.ErrorGroupStats) {
    const timedCount = groupStats.timedCounts[0];
    return timedCount && timedCount.count >= this.minFrequency;
  }

  /** Finds frequent errors to create tracking issues for. */
  async newErrorsToReport(): Promise<Array<Stackdriver.ErrorGroupStats>> {
    return (await this.client.listGroups(this.pageLimit))
      .filter(({group}) => !this.hasTrackingIssue(group))
      .filter(groupStats => this.hasHighFrequency(groupStats));
  }

  /** Reports an error to the bot endpoint, returning the created issue URL. */
  async reportError({
    group,
    firstSeenTime,
    timedCounts,
    representative,
  }: Stackdriver.ErrorGroupStats): Promise<string> {
    console.info(`Reporting error group ${group.groupId} to error issue bot`);
    const errorReport: ErrorReport = {
      errorId: group.groupId,
      firstSeen: firstSeenTime,
      dailyOccurrences: timedCounts[0].count,
      stacktrace: representative.message,
    };
    const {status, statusText, headers} = await fetch(
      ERROR_ISSUE_REPORT_ENDPOINT,
      {
        method: 'POST',
        redirect: 'manual',
        body: JSON.stringify(errorReport),
        headers: {'Content-Type': 'application/json'},
      }
    );

    if (status !== statusCodes.MOVED_TEMPORARILY) {
      throw new Error(
        `HTTP ${status} (${statusText}): ` +
          `Failed to file GitHub issue for "${group.groupId}`
      );
    }

    const issueUrl = headers.get('Location');
    console.info(`Successfully created error report issue: ${issueUrl}`);
    return issueUrl;
  }

  /** Identifies new, frequent errors and reports GitHub issues. */
  async monitorAndReport() {
    const errors = await this.newErrorsToReport();
    console.debug(`Found ${errors.length} new error groups to report`);
    const urls: Array<string> = [];

    for (const error of errors) {
      try {
        const url = await this.reportError(error);
        urls.push(url);
        await this.client.setGroupIssue(error.group.groupId, url);
      } catch (error) {
        console.error(error);
      }
    }

    return urls;
  }
}
