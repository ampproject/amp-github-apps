/**
 * Copyright 2021 The AMP HTML Authors. All Rights Reserved.
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

const mockFetch = jest.fn();
global.fetch = mockFetch;

import {getSnapshots} from '../src/percy';

describe('percy', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('gets snapshots', async () => {
    mockFetch.mockResolvedValue({
      status: 200,
      json: async () => ({
        data: [
          {
            type: 'snapshots',
            id: '34fbdb1d-67ee-4030-bba9-c190dd729644',
            attributes: {
              name: 'Snapshot A',
              'review-state': 'approved',
              'review-state-reason': 'no_diffs',
            },
          },
          {
            type: 'snapshots',
            id: 'a4a85051-d30c-4334-a99e-b865b09065bc',
            attributes: {
              name: 'Snapshot B',
              'review-state': 'approved',
              'review-state-reason': 'no_diffs',
            },
          },
        ],
      }),
    });

    const snapshots = await getSnapshots(1234);

    expect(snapshots).toEqual(
      new Map([
        [
          'Snapshot A',
          {
            type: 'snapshots',
            id: '34fbdb1d-67ee-4030-bba9-c190dd729644',
            attributes: {
              name: 'Snapshot A',
              'review-state': 'approved',
              'review-state-reason': 'no_diffs',
            },
          },
        ],
        [
          'Snapshot B',
          {
            type: 'snapshots',
            id: 'a4a85051-d30c-4334-a99e-b865b09065bc',
            attributes: {
              name: 'Snapshot B',
              'review-state': 'approved',
              'review-state-reason': 'no_diffs',
            },
          },
        ],
      ])
    );
  });

  it('rejects when build not found', async () => {
    mockFetch.mockResolvedValue({
      status: 404,
      json: async () => ({'errors': [{'status': 'not_found'}]}),
    });

    await expect(getSnapshots(1234)).rejects.toThrow(
      'Failed to fetch snapshots for build #1234'
    );
  });
});
