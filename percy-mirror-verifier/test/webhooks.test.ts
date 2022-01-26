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

import {getBuildId, getIncluded, getPullNumber} from '../src/webhooks';

describe('webhooks', () => {
  describe('getBuildId', () => {
    it('gets build id', () => {
      const buildId = getBuildId([
        {
          type: 'builds',
          id: '1234567',
          attributes: {
            'build-number': 1234,
            'is-pull-request': false,
            'review-state': 'approved',
            branch: 'main',
          },
        },
      ]);
      expect(buildId).toEqual(1234567);
    });

    it('throws when no build is inluded', () => {
      expect(() => {
        getBuildId([
          {
            type: 'commits',
            id: '1234567',
            attributes: {
              'author-name': 'ampprojectbot',
              message: 'Commit (#1234)',
              sha: 'adb675521b6ec4ddbec96f24f70b137b3807ded3',
            },
          },
        ]);
      }).toThrow("Cannot read properties of undefined (reading 'id')");
    });
  });

  describe('getPullNumber', () => {
    it('gets pull request number', () => {
      const pullNumber = getPullNumber([
        {
          type: 'commits',
          id: '1234567',
          attributes: {
            'author-name': 'ampprojectbot',
            message: 'Commit (#1234)',
            sha: 'adb675521b6ec4ddbec96f24f70b137b3807ded3',
          },
        },
      ]);

      expect(pullNumber).toEqual(1234);
    });

    it('throws when no commit is inluded', () => {
      expect(() => {
        getPullNumber([
          {
            type: 'builds',
            id: '1234567',
            attributes: {
              'build-number': 1234,
              'is-pull-request': false,
              'review-state': 'approved',
              branch: 'main',
            },
          },
        ]);
      }).toThrow("Cannot read properties of undefined (reading 'attributes')");
    });

    it('throws when commit message does not indicate a pull request', () => {
      expect(() => {
        getPullNumber([
          {
            type: 'commits',
            id: '1234567',
            attributes: {
              'author-name': 'ampprojectbot',
              message: 'Commit',
              sha: 'adb675521b6ec4ddbec96f24f70b137b3807ded3',
            },
          },
        ]);
      }).toThrow(
        'object null is not iterable (cannot read property Symbol(Symbol.iterator))'
      );
    });
  });

  describe('getIncluded', () => {
    it('gets included', () => {
      const included = getIncluded(
        [
          {
            type: 'builds',
            id: '1234567',
            attributes: {
              'build-number': 1234,
              'is-pull-request': false,
              'review-state': 'approved',
              branch: 'main',
            },
          },
          {
            type: 'commits',
            id: '1234567',
            attributes: {
              'author-name': 'ampprojectbot',
              message: 'Commit (#1234)',
              sha: 'adb675521b6ec4ddbec96f24f70b137b3807ded3',
            },
          },
        ],
        'commits'
      );

      expect(included).toEqual({
        type: 'commits',
        id: '1234567',
        attributes: {
          'author-name': 'ampprojectbot',
          message: 'Commit (#1234)',
          sha: 'adb675521b6ec4ddbec96f24f70b137b3807ded3',
        },
      });
    });

    it('returns undefined if not found', () => {
      const included = getIncluded(
        [
          {
            type: 'builds',
            id: '1234567',
            attributes: {
              'build-number': 1234,
              'is-pull-request': false,
              'review-state': 'approved',
              branch: 'main',
            },
          },
        ],
        'commits'
      );

      expect(included).toBeUndefined();
    });
  });
});
