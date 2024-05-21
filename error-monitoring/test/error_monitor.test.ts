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

import {
  MockedObject,
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import {Stackdriver} from 'error-monitoring';
import nock from 'nock';

import {
  ErrorMonitor,
  ServiceErrorMonitor,
  ServiceName,
} from '../src/error_monitor';
import {StackdriverApi} from '../src/stackdriver_api';

describe('ErrorMonitor', () => {
  let monitor: ErrorMonitor;
  const stackdriver = {
    listGroups: vi.fn(),
    setGroupIssue: vi.fn(),
  } as unknown as MockedObject<StackdriverApi>;

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
        count: 2000,
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

  beforeAll(() => {
    nock.disableNetConnect();
  });

  afterAll(() => {
    nock.enableNetConnect();
  });

  beforeEach(() => {
    monitor = new ErrorMonitor(stackdriver, 5000);
    stackdriver.listGroups.mockResolvedValue(errorGroups);
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

  describe('service', () => {
    it('creates a service monitor', () => {
      const serviceMonitor = monitor.service(ServiceName.PRODUCTION);
      expect(serviceMonitor).toBeInstanceOf(ServiceErrorMonitor);
    });
  });

  describe('threshold', () => {
    it('creates a monitor with a different minimum frequency', async () => {
      const thresholdMonitor = monitor.threshold(1000);
      const newErrors = await thresholdMonitor.newErrorsToReport();
      const newErrorIds = newErrors.map(({errorId}) => errorId);
      expect(newErrorIds).toEqual(['infrequent_id', 'new_id']);
    });
  });
});

describe('ServiceErrorMonitor', () => {
  let monitor: ServiceErrorMonitor;
  const stackdriver = {
    listServiceGroups: vi.fn(),
  } as unknown as MockedObject<StackdriverApi>;

  const prodStableService: Stackdriver.ServiceContext = {
    service: 'CDN Production',
    version: '04-24 Stable (1234)',
  };

  const infrequentGroup: Stackdriver.ErrorGroupStats = {
    group: {
      name: 'Error: Infrequent error',
      groupId: 'infrequent_id',
    },
    count: 200,
    timedCounts: [
      {
        count: 200,
        startTime: new Date('Feb 25, 2020'),
        endTime: new Date('Feb 26, 2020'),
      },
    ],
    firstSeenTime: new Date('Feb 20, 2020'),
    numAffectedServices: 1,
    affectedServices: [prodStableService],
    representative: {message: 'Error: Infrequent error'},
  };
  const newGroup: Stackdriver.ErrorGroupStats = {
    group: {
      name: 'Error: New error',
      groupId: 'new_id',
    },
    count: 2000,
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
  const errorGroups = [infrequentGroup, newGroup];

  beforeAll(() => {
    nock.disableNetConnect();
  });

  afterAll(() => {
    nock.enableNetConnect();
  });

  beforeEach(() => {
    monitor = new ServiceErrorMonitor(
      stackdriver,
      ServiceName.DEVELOPMENT,
      500
    );
    stackdriver.listServiceGroups.mockResolvedValue(errorGroups);
  });

  describe('newErrorsToReport', () => {
    it('ignores infrequent errors', async () => {
      const newErrors = await monitor.newErrorsToReport();
      const newErrorIds = newErrors.map(({errorId}) => errorId);
      expect(newErrorIds).toEqual(['new_id']);
      expect(stackdriver.listServiceGroups).toHaveBeenCalledWith('CDN 1%', 25);
    });
  });

  describe('threshold', () => {
    it('creates a monitor with a different minimum frequency', async () => {
      const thresholdMonitor = monitor.threshold(100);
      const newErrors = await thresholdMonitor.newErrorsToReport();
      const newErrorIds = newErrors.map(({errorId}) => errorId);
      expect(newErrorIds).toEqual(['infrequent_id', 'new_id']);
    });
  });
});
