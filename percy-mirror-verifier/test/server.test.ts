/**
 * Copyright 2022 The AMP HTML Authors. All Rights Reserved.
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

import {IncomingMessage} from 'http';

import deepmerge from 'deepmerge';

import {PercySnapshot} from '../src/percy';
import {PercyWebhookIncluded} from '../src/webhooks';

const mockGetPercyBuildId = jest.fn();
const mockPostErrorComment = jest.fn();
jest.doMock('../src/github', () => ({
  getPercyBuildId: mockGetPercyBuildId,
  postErrorComment: mockPostErrorComment,
}));

const mockGetSnapshots = jest.fn();
jest.doMock('../src/percy', () => ({
  getSnapshots: mockGetSnapshots,
}));

import {handleBuildFinished, verify} from '../src/server';

type DeepPartial<T> = T extends object
  ? {
      [P in keyof T]?: DeepPartial<T[P]>;
    }
  : T;

describe('server', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  describe('verify', () => {
    let req: IncomingMessage | undefined;

    beforeAll(() => {
      process.env.PERCY_WEBHOOK_SECRET = 'kittens';
    });

    beforeEach(() => {
      req = new IncomingMessage(null);
    });

    it('verifiest X-Percy-Digest correctly', () => {
      req.headers['x-percy-digest'] =
        '45673a3837ff0209008f56e7310dfb5620b0824b3fb9ff02c0a7e838d0433b6f';

      expect(() => {
        verify(req, null, Buffer.from([0, 1, 2, 3]));
      }).not.toThrow();
    });

    it('throws on unverifiable X-Percy-Digest', () => {
      req.headers['x-percy-digest'] =
        '8f6d9eb929ec018ec07be05f4c952a5241e70318dbd832878743708fa7d843c0';

      expect(() => {
        verify(req, null, Buffer.from([0, 1, 2, 3]));
      }).toThrow('Message digest is incorrect for PERCY_WEBHOOK_SECRET');
    });
  });

  describe('handleBuildFinished', () => {
    const snapshotBlankPage: PercySnapshot = {
      type: 'snapshots',
      id: '832098704',
      attributes: {
        name: 'Blank page',
        'review-state': 'approved',
        'review-state-reason': 'no_diffs',
      },
    };
    const snapshotA: PercySnapshot = {
      type: 'snapshots',
      id: '832098742',
      attributes: {
        name: 'Snapshot A',
        'review-state': 'approved',
        'review-state-reason': 'no_diffs',
      },
    };
    const snapshotB: PercySnapshot = {
      type: 'snapshots',
      id: '832098753',
      attributes: {
        name: 'Snapshot B',
        'review-state': 'approved',
        'review-state-reason': 'no_diffs',
      },
    };

    const notApproved: DeepPartial<PercySnapshot> = {
      attributes: {
        'review-state': 'unreviewed',
        'review-state-reason': null,
      },
    };
    const userApproved: DeepPartial<PercySnapshot> = {
      attributes: {
        'review-state-reason': 'user_approved',
      },
    };
    const autoApproved: DeepPartial<PercySnapshot> = {
      attributes: {
        'review-state-reason': 'auto_approved_branch',
      },
    };

    const included: PercyWebhookIncluded[] = [
      {
        type: 'builds',
        id: '1234567',
        attributes: {
          branch: 'main',
          'build-number': 124,
          'review-state': 'approved',
          'is-pull-request': false,
        },
      },
      {
        type: 'commits',
        id: '8901234',
        attributes: {
          sha: 'c4bbc4e8739dc734cc3cb1e5034cc2b550196a55',
          message: 'Commit (#5678)',
          'author-name': 'ampprojectbot',
        },
      },
    ];

    it('verifies mirrored PR/main builds with no diffs', async () => {
      mockGetPercyBuildId.mockResolvedValue(1234566);
      mockGetSnapshots.mockResolvedValueOnce(
        new Map([
          ['Snapshot A', snapshotA],
          ['Snapshot B', snapshotB],
        ])
      );
      mockGetSnapshots.mockResolvedValueOnce(
        new Map([
          ['Blank page', snapshotBlankPage],
          ['Snapshot A', snapshotA],
          ['Snapshot B', snapshotB],
        ])
      );

      await handleBuildFinished(included);

      expect(mockGetPercyBuildId).toHaveBeenCalledWith(5678);
      expect(mockGetSnapshots).toHaveBeenCalledTimes(2);
      expect(mockGetSnapshots).toHaveBeenNthCalledWith(1, 1234566);
      expect(mockGetSnapshots).toHaveBeenNthCalledWith(2, 1234567);
      expect(mockPostErrorComment).not.toHaveBeenCalled();
    });

    it('verifies mirrored PR/main builds with approved diffs', async () => {
      mockGetPercyBuildId.mockResolvedValue(1234566);
      mockGetSnapshots.mockResolvedValueOnce(
        new Map([['Snapshot A', deepmerge(snapshotA, userApproved)]])
      );
      mockGetSnapshots.mockResolvedValueOnce(
        new Map([
          ['Blank page', snapshotBlankPage],
          ['Snapshot A', deepmerge(snapshotA, autoApproved)],
        ])
      );

      await handleBuildFinished(included);

      expect(mockPostErrorComment).not.toHaveBeenCalled();
    });

    it('rejects a build when snapshot in main has a diff, but not in PR', async () => {
      mockGetPercyBuildId.mockResolvedValue(1234566);
      mockGetSnapshots.mockResolvedValueOnce(
        new Map([['Snapshot A', snapshotA]])
      );
      mockGetSnapshots.mockResolvedValueOnce(
        new Map([
          ['Blank page', snapshotBlankPage],
          ['Snapshot A', deepmerge(snapshotA, autoApproved)],
        ])
      );

      await handleBuildFinished(included);

      expect(mockPostErrorComment).toHaveBeenCalledWith(5678);
    });

    it('rejects a build when snapshot in PR has a diff, but not in main', async () => {
      mockGetPercyBuildId.mockResolvedValue(1234566);
      mockGetSnapshots.mockResolvedValueOnce(
        new Map([['Snapshot A', deepmerge(snapshotA, userApproved)]])
      );
      mockGetSnapshots.mockResolvedValueOnce(
        new Map([
          ['Blank page', snapshotBlankPage],
          ['Snapshot A', snapshotA],
        ])
      );

      await handleBuildFinished(included);

      expect(mockPostErrorComment).toHaveBeenCalledWith(5678);
    });

    it('rejects a build when snapshot exists in main but not in PR', async () => {
      mockGetPercyBuildId.mockResolvedValue(1234566);
      mockGetSnapshots.mockResolvedValueOnce(
        new Map([['Snapshot B', snapshotB]])
      );
      mockGetSnapshots.mockResolvedValueOnce(
        new Map([
          ['Blank page', snapshotBlankPage],
          ['Snapshot A', snapshotA],
          ['Snapshot B', snapshotB],
        ])
      );

      await handleBuildFinished(included);

      expect(mockPostErrorComment).toHaveBeenCalledWith(5678);
    });

    it('rejects a build when snapshot exists in PR but not in main', async () => {
      mockGetPercyBuildId.mockResolvedValue(1234566);
      mockGetSnapshots.mockResolvedValueOnce(
        new Map([
          ['Snapshot A', snapshotA],
          ['Snapshot B', snapshotB],
        ])
      );
      mockGetSnapshots.mockResolvedValueOnce(
        new Map([
          ['Blank page', snapshotBlankPage],
          ['Snapshot B', snapshotB],
        ])
      );

      await handleBuildFinished(included);

      expect(mockPostErrorComment).toHaveBeenCalledWith(5678);
    });

    it('rejects a build when snapshot names do not match', async () => {
      mockGetPercyBuildId.mockResolvedValue(1234566);
      mockGetSnapshots.mockResolvedValueOnce(
        new Map([['Snapshot A', snapshotA]])
      );
      mockGetSnapshots.mockResolvedValueOnce(
        new Map([
          ['Blank page', snapshotBlankPage],
          ['Snapshot B', snapshotB],
        ])
      );

      await handleBuildFinished(included);

      expect(mockPostErrorComment).toHaveBeenCalledWith(5678);
    });

    it('rejects a build when any snapshots are not approved', async () => {
      mockGetPercyBuildId.mockResolvedValue(1234566);
      mockGetSnapshots.mockResolvedValueOnce(
        new Map([['Snapshot A', deepmerge(snapshotA, notApproved)]])
      );
      mockGetSnapshots.mockResolvedValueOnce(
        new Map([
          ['Blank page', snapshotBlankPage],
          ['Snapshot A', snapshotA],
        ])
      );

      await handleBuildFinished(included);

      expect(mockPostErrorComment).toHaveBeenCalledWith(5678);
    });

    it('does nothing for non-main builds', async () => {
      await handleBuildFinished([
        {
          type: 'builds',
          id: '1234567',
          attributes: {
            branch: 'nightly',
            'build-number': 124,
            'review-state': 'approved',
            'is-pull-request': false,
          },
        },
      ]);

      expect(mockGetPercyBuildId).not.toHaveBeenCalled();
      expect(mockGetSnapshots).not.toHaveBeenCalled();
      expect(mockPostErrorComment).not.toHaveBeenCalled();
    });
  });
});
