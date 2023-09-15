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

import {GitHub} from '../src/github';
import {Request, Response} from 'express';
import {RotationReporterPayload} from 'onduty';
import {refreshRotation} from '..';

jest.mock('../src/github');
const mockGitHub = GitHub.prototype as jest.Mocked<GitHub>;

describe('On-Duty Bot', () => {
  let response: Response;
  const request = (body: RotationReporterPayload): Request =>
    ({body, query: {}}) as Request;

  beforeAll(() => {
    console.debug = jest.fn();
    console.info = jest.fn();
    console.error = jest.fn();
  });

  beforeEach(() => {
    response = {
      send: jest.fn(),
      sendStatus: jest.fn(),
      status: jest.fn(),
    } as unknown as Response;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('refreshes GitHub teams with new rotations', async () => {
    mockGitHub.getTeamMembers.mockResolvedValueOnce([
      'old-builder-primary',
      'builder-primary',
    ]);
    mockGitHub.getTeamMembers.mockResolvedValueOnce([
      'old-onduty-primary',
      'onduty-primary',
    ]);

    await refreshRotation(
      request({
        'build-on-duty': {
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
    expect(mockGitHub.getTeamMembers).toHaveBeenCalledWith('build-team');
    expect(mockGitHub.getTeamMembers).toHaveBeenCalledWith('release-team');
    expect(mockGitHub.removeFromTeam).toHaveBeenCalledWith(
      'build-team',
      'old-builder-primary'
    );
    expect(mockGitHub.removeFromTeam).toHaveBeenCalledWith(
      'release-team',
      'old-onduty-primary'
    );
  });

  it('returns 401 Unauthorized for an invalid token', async () => {
    await refreshRotation(
      request({
        'build-on-duty': {
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
    mockGitHub.getTeamMembers.mockRejectedValue(
      new Error('Splines have not been reticulated')
    );

    await refreshRotation(
      request({
        'build-on-duty': {
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
      'Error: Splines have not been reticulated'
    );
  });
});
