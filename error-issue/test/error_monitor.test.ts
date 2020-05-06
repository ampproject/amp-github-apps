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

import {ErrorMonitor} from '../src/error_monitor';
import {Stackdriver} from 'error-issue-bot';
import {StackdriverApi} from '../src/stackdriver_api';

import {mocked} from 'ts-jest/utils';
import nock from 'nock';

describe('ErrorMonitor', () => {
  let monitor: ErrorMonitor;
  const stackdriver = ({
    listGroups: jest.fn(),
    setGroupIssue: jest.fn(),
  } as unknown) as StackdriverApi;

  const prodStableService: Stackdriver.ServiceContext = {
    service: 'CDN Production',
    version: '04-24 Stable (1234)',
  };

  const infrequentGroup: Stackdriver.ErrorGroupStats = {
    group: {
      name: 'Error: Infrequent error',
      groupId: 'infrequent_id',
    },
    count: 2000,
    timedCounts: [
      {
        count: 4,
        startTime: new Date('Feb 25, 2020'),
        endTime: new Date('Feb 26, 2020'),
      },
    ],
    firstSeenTime: new Date('Feb 20, 2020'),
    numAffectedServices: 1,
    affectedServices: [prodStableService],
    representative: {message: 'Error: Infrequent error'},
  };
  const acknowledgedGroup: Stackdriver.ErrorGroupStats = {
    group: {
      name: 'Error: Acknowledged error',
      groupId: 'acknowledged_id',
      trackingIssues: [{url: 'https://github.com/blah/blah'}],
    },
    count: 20000,
    timedCounts: [
      {
        count: 6000,
        startTime: new Date('Feb 25, 2020'),
        endTime: new Date('Feb 26, 2020'),
      },
    ],
    firstSeenTime: new Date('Feb 20, 2020'),
    numAffectedServices: 1,
    affectedServices: [prodStableService],
    representative: {message: 'Error: Acknowledged error'},
  };
  const newGroup: Stackdriver.ErrorGroupStats = {
    group: {
      name: 'Error: New error',
      groupId: 'new_id',
    },
    count: 20000,
    timedCounts: [
      {
        count: 6000,
        startTime: new Date('Feb 25, 2020'),
        endTime: new Date('Feb 26, 2020'),
      },
    ],
    firstSeenTime: new Date('Feb 20, 2020'),
    numAffectedServices: 2,
    affectedServices: [prodStableService],
    representative: {message: 'Error: New error'},
  };

  const errorGroups = [infrequentGroup, acknowledgedGroup, newGroup];
  const newReport = {
    errorId: 'new_id',
    firstSeen: new Date('Feb 20, 2020'),
    dailyOccurrences: 6000,
    stacktrace: 'Error: New error',
    seenInVersions: ['04-24 Stable (1234)', '+1 more'],
  };

  beforeAll(() => {
    nock.disableNetConnect();
  });

  afterAll(() => {
    nock.enableNetConnect();
  });

  beforeEach(() => {
    monitor = new ErrorMonitor(stackdriver);
    mocked(stackdriver.listGroups).mockResolvedValue(errorGroups);
    nock.cleanAll();
  });

  afterEach(() => {
    // Fail the test if there were unused nocks.
    if (!nock.isDone()) {
      throw new Error('Not all nock interceptors were used!');
    }
    nock.cleanAll();
  });

  describe('newErrorsToReport', () => {
    it('ignores infrequent and already-tracked errors', async () => {
      const newErrors = await monitor.newErrorsToReport();
      const newErrorIds = newErrors.map(({errorId}) => errorId);
      expect(newErrorIds).toEqual(['new_id']);
    });
  });

  describe('reportError', () => {
    it('reports the error to the error-issue endpoint', async () => {
      nock('https://us-central1-amp-error-issue-bot.cloudfunctions.net')
        .post('/error-issue', body => {
          expect(body).toMatchObject({
            errorId: 'new_id',
            firstSeen: expect.stringMatching(/^2020-02-20T/),
            dailyOccurrences: 6000,
            stacktrace: 'Error: New error',
          });
          return true;
        })
        .reply(302);

      await monitor.reportError(newReport);
    });

    it('returns the URL of the created issue', async () => {
      nock('https://us-central1-amp-error-issue-bot.cloudfunctions.net')
        .post('/error-issue')
        .reply(302, null, {Location: 'http://github.com.com/blah/blah'});

      await expect(monitor.reportError(newReport)).resolves.toEqual(
        'http://github.com.com/blah/blah'
      );
    });

    it('throws an error when error creation fails', async () => {
      nock('https://us-central1-amp-error-issue-bot.cloudfunctions.net')
        .post('/error-issue')
        .reply(400);

      await expect(monitor.reportError(newReport)).rejects.toThrow(
        'HTTP 400 (Bad Request)'
      );
    });
  });

  describe('monitorAndReport', () => {
    beforeEach(() => {
      monitor.reportError = jest
        .fn()
        .mockReturnValue('https://github.com/blah/blah');
    });

    it('reports new errors', async () => {
      await monitor.monitorAndReport();

      expect(monitor.reportError).toHaveBeenCalledTimes(1);
      expect(monitor.reportError).toHaveBeenCalledWith(newReport);
    });

    it('returns created URLs', async () => {
      await expect(monitor.monitorAndReport()).resolves.toEqual([
        'https://github.com/blah/blah',
      ]);
    });

    it('sets tracking issues for new errors', async () => {
      await monitor.monitorAndReport();

      expect(stackdriver.setGroupIssue).toHaveBeenCalledWith(
        'new_id',
        'https://github.com/blah/blah'
      );
    });

    it('handles failed attempts to report errors', async () => {
      jest.spyOn(console, 'error').mockImplementation(() => {
        // Do nothing
      });
      monitor.reportError = jest.fn().mockImplementation(async () => {
        throw new Error('Oops!');
      });

      await expect(monitor.monitorAndReport()).resolves.toEqual([]);
      expect(console.error).toHaveBeenCalled();
      mocked(console.error).mockRestore();
    });
  });
});
