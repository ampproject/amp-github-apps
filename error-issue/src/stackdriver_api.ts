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
import {GaxiosOptions} from 'gaxios';
import {GoogleAuth} from 'google-auth-library';

const SERVICE = 'https://clouderrorreporting.googleapis.com';
const SECONDS_IN_DAY = 60 * 60 * 24;

export class StackdriverApi {
  private auth = new GoogleAuth({
    scopes: 'https://www.googleapis.com/auth/cloud-platform',
  });

  constructor(private projectId: string) {}

  /** Makes a request to the Cloud Error Reporting API. */
  private async request(
    endpoint: string,
    method: 'GET' | 'PUT',
    body?: Object
  ): Promise<any> {
    const client = await this.auth.getClient();
    const opts: GaxiosOptions = {
      url: `${SERVICE}/v1beta1/projects/${this.projectId}/${endpoint}`,
      method,
    };

    if (method === 'GET') {
      opts.params = body;
    } else {
      opts.body = JSON.stringify(body);
    }

    return client.request(opts).then(({data}) => data);
  }

  private deserialize({
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
    console.info(`Fetching first ${pageSize} error groups`);
    const {errorGroupStats} = await this.request('groupStats', 'GET', {
      'timeRange.period': 'PERIOD_1_DAY',
      pageSize: pageSize,
      timedCountDuration: `${SECONDS_IN_DAY}s`,
    });

    return errorGroupStats.map((stats: Stackdriver.SerializedErrorGroupStats) =>
      this.deserialize(stats)
    );
  }

  /**
   * Sets the tracking issue for an error group.
   * See https://cloud.google.com/error-reporting/reference/rest/v1beta1/projects.groups/update
   */
  async setGroupIssue(
    groupId: string,
    issueUrl: string
  ): Promise<Stackdriver.ErrorGroup> {
    console.info(
      `Updating tracking issue for error group "${groupId}" to "${issueUrl}"`
    );
    return this.request(`groups/${groupId}`, 'PUT', {
      trackingIssues: [{url: issueUrl}],
    });
  }
}
