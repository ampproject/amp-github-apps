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

import {Request, Response} from 'express';
import {RotationReporterPayload} from 'onduty';
import {refreshRotation} from '..';
import nock from 'nock';

describe('On-Duty Bot', () => {
  let response: Response;
  const request = (body: RotationReporterPayload): Request =>
    ({body, query: {}} as Request);

  beforeAll(() => {
    nock.disableNetConnect();
    console.debug = jest.fn();
    console.info = jest.fn();
    console.error = jest.fn();
  });
  afterAll(() => nock.enableNetConnect());

  beforeEach(() => {
    nock.cleanAll();
    response = ({
      send: jest.fn(),
      sendStatus: jest.fn(),
      status: jest.fn(),
    } as unknown) as Response;
  });

  afterEach(() => {
    jest.restoreAllMocks();

    // Fail the test if there were unused nocks.
    if (!nock.isDone()) {
      throw new Error('Not all nock interceptors were used!');
    }
  });

  it('refreshes GitHub teams with new rotations', async () => {
    nock('https://api.github.com')
      .get('/orgs/test_org/teams/build-team/members')
      .reply(200, [{login: 'old-builder-primary'}, {login: 'builder-primary'}])
      .put('/orgs/test_org/teams/build-team/memberships/builder-secondary')
      .reply(200)
      .delete('/orgs/test_org/teams/build-team/memberships/old-builder-primary')
      .reply(204)
      .get('/orgs/test_org/teams/release-team/members')
      .reply(200, [{login: 'old-onduty-primary'}, {login: 'onduty-primary'}])
      .put('/orgs/test_org/teams/release-team/memberships/onduty-secondary')
      .reply(200)
      .delete(
        '/orgs/test_org/teams/release-team/memberships/old-onduty-primary'
      )
      .reply(204);

    await refreshRotation(
      request({
        'build-cop': {
          primary: 'builder-primary',
          secondary: 'builder-secondary',
        },
        'release-on-duty': {
          primary: 'onduty-primary',
          secondary: 'onduty-secondary',
        },
        accessToken: '_TOKEN_',
      }),
      response
    );

    expect(response.sendStatus).toHaveBeenCalledWith(200);
  });

  it('returns 401 Unauthorized for an invalid token', async () => {
    await refreshRotation(
      request({
        'build-cop': {
          primary: 'builder-primary',
          secondary: 'builder-secondary',
        },
        'release-on-duty': {
          primary: 'onduty-primary',
          secondary: 'onduty-secondary',
        },
        accessToken: '_BAD_TOKEN_',
      }),
      response
    );

    expect(response.sendStatus).toHaveBeenCalledWith(401);
  });

  it('returns 500 Internal Server Error if something goes wrong', async () => {
    nock('https://api.github.com')
      .get('/orgs/test_org/teams/build-team/members')
      .reply(401, 'Bad authentication token');

    await refreshRotation(
      request({
        'build-cop': {
          primary: 'builder-primary',
          secondary: 'builder-secondary',
        },
        'release-on-duty': {
          primary: 'onduty-primary',
          secondary: 'onduty-secondary',
        },
        accessToken: '_TOKEN_',
      }),
      response
    );

    expect(response.status).toHaveBeenCalledWith(500);
    expect(response.send).toHaveBeenCalledWith(
      'HttpError: Bad authentication token'
    );
  });
});
