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

import nock from 'nock';

import {RateLimitedGraphQL} from '../src/rate_limited_graphql';

jest.useFakeTimers();

describe('RateLimitedGraphQL', () => {
  let client: RateLimitedGraphQL;
  const query = '{ viewer { login } }';
  const response = {data: {viewer: {login: 'auser'}}};

  beforeAll(() => {
    nock.disableNetConnect();
  });

  afterAll(() => {
    nock.enableNetConnect();
    jest.unmock('@octokit/graphql');
  });

  beforeEach(() => {
    client = new RateLimitedGraphQL('__TOKEN__');
    nock.cleanAll();
  });

  afterEach(() => {
    // Fail the test if there were unused nocks.
    if (!nock.isDone()) {
      throw new Error('Not all nock interceptors were used!');
    }
    nock.cleanAll();
  });

  it('returns the query result', async () => {
    nock('https://api.github.com')
      .post('/graphql')
      .reply(200, response);

    await expect(client.runQuery(query)).resolves.toEqual(response.data);
  });

  it('queues multiple queries and executes after delay', async () => {
    nock('https://api.github.com')
      .post('/graphql')
      .reply(200, response);

    const firstQuery = client.runQuery(query);
    // If later queries execute before they are nocked, the test will fail.
    const secondQuery = client.runQuery(query);
    const thirdQuery = client.runQuery(query);

    await expect(firstQuery).resolves.toEqual(response.data);

    nock('https://api.github.com')
      .post('/graphql')
      .reply(200, response);
    jest.advanceTimersByTime(1000);
    await expect(secondQuery).resolves.toEqual(response.data);

    nock('https://api.github.com')
      .post('/graphql')
      .reply(200, response);
    jest.advanceTimersByTime(1000);
    await expect(thirdQuery).resolves.toEqual(response.data);
  });
});
