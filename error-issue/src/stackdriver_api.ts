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

import {Stackdriver} from './types';
import fetch from 'node-fetch';

const SERVICE = 'https://clouderrorreporting.googleapis.com';
const SECONDS_IN_DAY = 60 * 60 * 24;

export class StackdriverApi {
  private baseUrl: string;

  constructor(private token: string, private projectId: string) {
    this.baseUrl = `${SERVICE}/v1beta1/projects/${projectId}`;
  }

  /** Makes an API request. */
  private async fetch(path: string, options: Object): Promise<any> {
    return fetch(`${this.baseUrl}/${path}`, {
      headers: {'Authorization': `Bearer ${this.token}`},
      ...options,
    }).then(async res => res.json());
  }

  /** Makes a GET request to the API. */
  async get(path: string): Promise<any> {
    return this.fetch(path, {method: 'GET'});
  }

  /** Makes a POST request to the API. */
  async put(path: string, data: Object): Promise<any> {
    return this.fetch(path, {method: 'PUT', body: JSON.stringify(data)});
  }

  private deserializeErrorGroupStats({
    group,
    count,
    timedCounts,
    firstSeenTime,
    representative,
  }: Stackdriver.SerializedErrorGroupStats): Stackdriver.ErrorGroupStats {
    return {
      group,
      count: parseInt(count, 10),
      timedCounts: timedCounts.map(tc => ({
        count: parseInt(tc.count, 10),
        startTime: new Date(tc.startTime),
        endTime: new Date(tc.endTime),
      })),
      firstSeenTime: new Date(firstSeenTime),
      representative: {message: representative.message},
    };
  }

  /**
   * List groups of errors.
   * See https://cloud.google.com/error-reporting/reference/rest/v1beta1/projects.groupStats/list
   */
  async listGroups(
    pageSize: number = 20
  ): Promise<Array<Stackdriver.ErrorGroupStats>> {
    const params = [
      'timeRange.period=PERIOD_1_DAY',
      `pageSize=${pageSize}`,
      `timedCountDuration=${SECONDS_IN_DAY}s`,
    ];
    const url = `groupStats?${params.join('&')}`;

    console.log(`Fetching first ${pageSize} error groups: ${url}`);
    const {error, errorGroupStats} = await this.get(url);
    if (error) {
      const {code, status, message} = error;
      throw new Error(`HTTP ${code} (${status}): ${message}`);
    }

    return errorGroupStats.map((stats: Stackdriver.SerializedErrorGroupStats) =>
      this.deserializeErrorGroupStats(stats)
    );
  }

  /**
   * Fetches details for a specific error group.
   * See https://cloud.google.com/error-reporting/reference/rest/v1beta1/projects.groups/get
   */
  async getGroup(groupId: string): Promise<Stackdriver.ErrorGroup> {
    console.log(`Fetching details for error group "${groupId}"`);
    return this.get(`groups/${groupId}`);
  }

  /**
   * Sets the tracking issue for an error group.
   * See https://cloud.google.com/error-reporting/reference/rest/v1beta1/projects.groups/update
   */
  async setGroupIssue(
    groupId: string,
    issueUrl: string
  ): Promise<Stackdriver.ErrorGroup> {
    console.log(
      `Updating tracking issue for error group "${groupId}" to "${issueUrl}"`
    );
    return this.put(`groups/${groupId}`, {
      trackingIssues: [{url: issueUrl}],
    });
  }
}
