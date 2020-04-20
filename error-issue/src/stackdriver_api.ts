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

import fetch from 'node-fetch';

const OAUTH_TOKEN = process.env.OAUTH_TOKEN;
const SERVICE = 'https://clouderrorreporting.googleapis.com'

class StackdriverApi {
  private baseUrl: string;

  constructor(private token: string, private projectId: string) {
    this.baseUrl = `${SERVICE}/v1beta1/projects/${projectId}`
  }

  /** Makes an API request. */
  private async fetch(path: string, options: Object): Promise<any> {
    return fetch(`${this.baseUrl}/${path}`, {
        headers: { 'Authorization': `Bearer ${this.token}` },
        ...options,
      })
      .then(res => {console.log(res); return res.json()});
  }

  /** Makes a GET request to the API. */
  async get(path: string) {
    return this.fetch(path, {method: 'GET'});
  }

  /** Makes a POST request to the API. */
  async put(path: string, data: Object) {
    console.log(JSON.stringify(data))
    return this.fetch(path, {method: 'PUT', body: JSON.stringify(data)});
  }

  /**
   * List groups of errors.
   * See https://cloud.google.com/error-reporting/reference/rest/v1beta1/projects.groupStats/list
   */
  async listGroups() {
    return this.get('groupStats?timeRange.period=PERIOD_1_DAY')
      .then(({errorGroupStats}) => errorGroupStats);
  }

  /**
   * Fetches details for a specific error group.
   * See https://cloud.google.com/error-reporting/reference/rest/v1beta1/projects.groups/get
   */
  async getGroup(groupId: string) {
    return this.get(`groups/${groupId}`);
  }

  /**
   * Sets the tracking issue for an error group.
   * See https://cloud.google.com/error-reporting/reference/rest/v1beta1/projects.groups/update
   */
  async setGroupIssue(groupId: string, issueUrl: string) {
    return this.put(`groups/${groupId}`, {
      trackingIssues: [{url: issueUrl}]
    });
  }
}
// console.log(resp.text());
// fetch(`${BASE_URL}/groupStats`).then(console.log);
const client = new StackdriverApi(process.env.OAUTH_TOKEN, 'amp-error-reporting-ads');
client.setGroupIssue(
  'CJml1-3R4YL8qQE',
  'https://github.com/ampproject/amphtml/issues/27675'
).then(console.log).catch(console.error);
