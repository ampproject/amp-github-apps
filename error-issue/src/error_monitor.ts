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

import {ErrorReport, ServiceGroup, Stackdriver} from 'error-issue-bot';
import {StackdriverApi} from './stackdriver_api';

import fetch from 'node-fetch';
import statusCodes from 'http-status-codes';

export const ERROR_ISSUE_ENDPOINT =
  process.env.ERROR_ISSUE_ENDPOINT ||
  'https://us-central1-amp-error-issue-bot.cloudfunctions.net/error-issue';

export enum ServiceName {
  PRODUCTION = 'CDN Production',
  DEVELOPMENT = 'CDN 1%',
  EXPERIMENTS = 'CDN Experiments',
  NIGHTLY = 'CDN Nightly',
}

/**
 * Set of service groups to monitor and details for scaling frequency.
 * Note: These values do not need to be exact; the order-of-magnitude is what's
 * important here.
 */
const SERVICE_GROUPS: Record<ServiceName, ServiceGroup> = {
  'CDN Production': {diversionPercent: 0.98, throttleRate: 0.1},
  'CDN 1%': {diversionPercent: 0.01, throttleRate: 1},
  'CDN Experiments': {diversionPercent: 0.01, throttleRate: 1},
  'CDN Nightly': {diversionPercent: 0.0005, throttleRate: 1},
};

/**
 * Returns the scaling factor to normalize frequency for a service group against
 * what it would be in production traffic.
 */
function scaleFactor(serviceName: ServiceName): number {
  const {
    diversionPercent: prodPercent,
    throttleRate: prodThrottle,
  } = SERVICE_GROUPS[ServiceName.PRODUCTION];
  const {diversionPercent, throttleRate} = SERVICE_GROUPS[serviceName];
  return (prodPercent * prodThrottle) / (diversionPercent * throttleRate);
}

export class ErrorMonitor {
  constructor(
    protected client: StackdriverApi,
    readonly minFrequency: number,
    protected pageLimit: number = 25
  ) {}

  /** Creates a service monitor using the same settings as this monitor. */
  service(serviceName: ServiceName): ServiceErrorMonitor {
    // eslint-disable-next-line @typescript-eslint/no-use-before-define
    return new ServiceErrorMonitor(
      this.client,
      serviceName,
      this.minFrequency / scaleFactor(serviceName),
      this.pageLimit
    );
  }

  /** Provides the frequency equivelent across all services. */
  get normalizedMinFrequency(): number {
    return this.minFrequency;
  }

  /** Creates an error monitor with a different frequency threshold. */
  threshold(minFrequency: number): ErrorMonitor {
    return new ErrorMonitor(this.client, minFrequency, this.pageLimit);
  }

  /** Tests if an error group already has an associated issue. */
  private hasTrackingIssue(group: Stackdriver.ErrorGroup): boolean {
    return !!group.trackingIssues;
  }

  /** Tests if an error group is occurring frequently enough to report. */
  protected hasHighFrequency(groupStats: Stackdriver.ErrorGroupStats): boolean {
    const timedCount = groupStats.timedCounts[0];
    return timedCount && timedCount.count >= this.minFrequency;
  }

  /** Converts error group stats to an error report to be filed. */
  reportFromGroupStats({
    group,
    firstSeenTime,
    timedCounts,
    representative,
    numAffectedServices,
    affectedServices,
  }: Stackdriver.ErrorGroupStats): ErrorReport {
    const seenInVersions = Array.from(
      new Set(affectedServices.map(({version}) => version))
    ).sort();
    const unlistedVersions = numAffectedServices - affectedServices.length;
    if (unlistedVersions) {
      seenInVersions.push(`+${unlistedVersions} more`);
    }

    return {
      errorId: group.groupId,
      firstSeen: firstSeenTime,
      dailyOccurrences: timedCounts[0].count,
      stacktrace: representative.message,
      seenInVersions,
    };
  }

  /** Finds top occurring errors. */
  protected async newErrors(): Promise<Array<Stackdriver.ErrorGroupStats>> {
    return this.client.listGroups(this.pageLimit);
  }

  /** Finds frequent errors to create tracking issues for. */
  async newErrorsToReport(): Promise<Array<ErrorReport>> {
    return (await this.newErrors())
      .filter(({group}) => !this.hasTrackingIssue(group))
      .filter(groupStats => this.hasHighFrequency(groupStats))
      .map(groupStats => this.reportFromGroupStats(groupStats));
  }

  /** Reports an error to the bot endpoint, returning the created issue URL. */
  async reportError(errorReport: ErrorReport): Promise<string> {
    const {errorId} = errorReport;
    console.info(`Reporting error group ${errorId} to error issue bot`);
    const {status, statusText, headers} = await fetch(ERROR_ISSUE_ENDPOINT, {
      method: 'POST',
      redirect: 'manual',
      body: JSON.stringify(errorReport),
      headers: {'Content-Type': 'application/json'},
    });

    if (status !== statusCodes.MOVED_TEMPORARILY) {
      throw new Error(
        `HTTP ${status} (${statusText}): ` +
          `Failed to file GitHub issue for "${errorId}`
      );
    }

    const issueUrl = headers.get('Location');
    console.info(`Successfully created error report issue: ${issueUrl}`);
    return issueUrl;
  }

  /** Identifies new, frequent errors and reports GitHub issues. */
  async monitorAndReport(): Promise<Array<string>> {
    const errors = await this.newErrorsToReport();
    console.info(`Found ${errors.length} new error groups to report`);
    const urls: Array<string> = [];

    for (const error of errors) {
      try {
        const url = await this.reportError(error);
        urls.push(url);
        await this.client.setGroupIssue(error.errorId, url);
      } catch (error) {
        console.error(error);
      }
    }

    return urls;
  }
}

export class ServiceErrorMonitor extends ErrorMonitor {
  // Note that minFrequency is relative to production traffic, and is scaled for
  // each diversion when thresholding.
  constructor(
    client: StackdriverApi,
    private serviceName: ServiceName,
    minFrequency: number,
    pageLimit = 25
  ) {
    super(client, minFrequency, pageLimit);
  }

  /** Provides the frequency equivelent across all services. */
  get normalizedMinFrequency(): number {
    return this.minFrequency * scaleFactor(this.serviceName);
  }

  /** Finds top occurring errors in the service group. */
  protected async newErrors(): Promise<Array<Stackdriver.ErrorGroupStats>> {
    return this.client.listServiceGroups(this.serviceName, this.pageLimit);
  }

  /** Creates an error monitor with a different frequency threshold. */
  threshold(minFrequency: number): ErrorMonitor {
    return new ServiceErrorMonitor(
      this.client,
      this.serviceName,
      minFrequency,
      this.pageLimit
    );
  }
}
