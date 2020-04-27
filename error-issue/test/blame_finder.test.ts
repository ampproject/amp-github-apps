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

import nock from 'nock';

import {RateLimitedGraphQL} from '../src/rate_limited_graphql';
import {BlameFinder} from '../src/blame_finder';
import {getGraphQLResponse} from './fixtures';

describe('BlameFinder', () => {
  let blameFinder: BlameFinder;

  beforeAll(() => {
    nock.disableNetConnect();
  });

  afterAll(() => {
    nock.enableNetConnect();
  });

  beforeEach(() => {
    blameFinder = new BlameFinder(
      'test_org',
      'test_repo',
      new RateLimitedGraphQL('__TOKEN__', 0)
    );
    nock.cleanAll();
  });

  afterEach(() => {
    // Fail the test if there were unused nocks.
    if (!nock.isDone()) {
      throw new Error('Not all nock interceptors were used!');
    }
    nock.cleanAll();
  });

  describe('blameForFile', () => {
    const rtv = '2004030010070';

    it('issues a GraphQL query for the file the the specified ref', async () => {
      const path = 'extensions/amp-next-page/1.0/service.js';

      nock('https://api.github.com')
        .post('/graphql', ({query}) => {
          expect(query).toContain(`ref(qualifiedName: "${rtv}")`);
          expect(query).toContain(`blame(path: "${path}"`);
          return true;
        })
        .reply(200, getGraphQLResponse(rtv, path));

      await blameFinder.blameForFile(rtv, path);
    });

    it('caches blame queries for rtv-path pairs', async () => {
      const path = 'extensions/amp-next-page/1.0/service.js';

      nock('https://api.github.com')
        .post('/graphql')
        .reply(200, getGraphQLResponse(rtv, path));

      await blameFinder.blameForFile(rtv, path);
      // If the second call triggers another query, the network request will
      // cause `nock` to fail this test.
      await blameFinder.blameForFile(rtv, path);
    });

    it('queries `master` if the ref is invalid', async () => {
      const path = 'src/log.js';

      nock('https://api.github.com')
        .post('/graphql', ({query}) => {
          expect(query).toContain(`ref(qualifiedName: "not-a-ref")`);
          expect(query).toContain(`blame(path: "${path}"`);
          return true;
        })
        .reply(200, getGraphQLResponse('not-a-ref', path))
        .post('/graphql', ({query}) => {
          expect(query).toContain(`ref(qualifiedName: "master")`);
          expect(query).toContain(`blame(path: "${path}"`);
          return true;
        })
        .reply(200, getGraphQLResponse('master', path));

      await blameFinder.blameForFile('not-a-ref', path);
    });

    it('returns blame ranges', async () => {
      const path = 'extensions/amp-next-page/1.0/service.js';

      nock('https://api.github.com')
        .post('/graphql')
        .reply(200, getGraphQLResponse(rtv, path));

      const ranges = await blameFinder.blameForFile(rtv, path);
      expect(ranges[0]).toMatchObject({
        path: 'extensions/amp-next-page/1.0/service.js',
        startingLine: 1,
        endingLine: 16,

        author: 'wassgha',
        committedDate: new Date('2019-12-10T07:48:41Z'),
        changedFiles: 11,
        prNumber: 25636,
      });
    });
  });

  describe('blameForLine', () => {
    const rtv = '2004030010070';
    const path = 'extensions/amp-next-page/1.0/service.js';

    it('finds the relevant blame range', async () => {
      nock('https://api.github.com')
        .post('/graphql')
        .reply(200, getGraphQLResponse(rtv, path));

      await expect(
        blameFinder.blameForLine({rtv, path, line: 785})
      ).resolves.toMatchObject({
        path,
        startingLine: 784,
        endingLine: 788,

        author: 'wassgha',
        committedDate: new Date('2020-02-28T23:59:08Z'),
        changedFiles: 24,
        prNumber: 26841,
      });
    });

    it('makes only one request per file', async () => {
      nock('https://api.github.com')
        .post('/graphql')
        .reply(200, getGraphQLResponse(rtv, path));

      await blameFinder.blameForLine({rtv, path, line: 785});
      // If the second call triggers another query, the network request will
      // cause `nock` to fail this test.
      await blameFinder.blameForLine({rtv, path, line: 294});
    });

    it('throws an error if no range contains the desired line', async () => {
      nock('https://api.github.com')
        .post('/graphql')
        .reply(200, getGraphQLResponse(rtv, path));

      await expect(
        blameFinder.blameForLine({rtv, path, line: 1337})
      ).rejects.toEqual(
        new RangeError(
          'Unable to find line 1337 in blame for "extensions/amp-next-page/1.0/service.js"'
        )
      );
    });
  });

  describe('blameForStacktrace', () => {
    it('fetches blame info for lines in the stacktrace', async () => {
      const stacktrace = `Error: null is not an object (evaluating 'b.acceleration.x')
        at x (https://raw.githubusercontent.com/ampproject/amphtml/2004030010070/extensions/amp-delight-player/0.1/amp-delight-player.js:421:13)
        at event (https://raw.githubusercontent.com/ampproject/amphtml/2004030010070/src/event-helper-listen.js:58:27)`;

      nock('https://api.github.com')
        .post('/graphql')
        .reply(
          200,
          getGraphQLResponse(
            '2004030010070',
            'extensions/amp-delight-player/0.1/amp-delight-player.js'
          )
        )
        .post('/graphql')
        .reply(
          200,
          getGraphQLResponse('2004030010070', 'src/event-helper-listen.js')
        );

      const blames = blameFinder.blameForStacktrace(stacktrace);
      await expect(blames).resolves.toEqual([
        {
          path: 'extensions/amp-delight-player/0.1/amp-delight-player.js',
          startingLine: 396,
          endingLine: 439,
          author: 'xymw',
          committedDate: new Date('2018-11-12T21:22:43.000Z'),
          changedFiles: 15,
          prNumber: 17939,
        },
        {
          path: 'src/event-helper-listen.js',
          startingLine: 57,
          endingLine: 59,
          author: 'rsimha',
          committedDate: new Date('2017-12-13T23:56:40.000Z'),
          changedFiles: 340,
          prNumber: 12450,
        },
      ]);
    });

    it('ignores commits without an associated GitHub user', async () => {
      const stacktrace = `Error: Cannot read property 'getBoundingClientRect' of undefined
        at el (https://raw.githubusercontent.com/ampproject/amphtml/2004172112280/extensions/amp-base-carousel/0.1/dimensions.js:58)
        at getDimension (https://raw.githubusercontent.com/ampproject/amphtml/2004172112280/extensions/amp-base-carousel/0.1/dimensions.js:73)
        at getCenter (https://raw.githubusercontent.com/ampproject/amphtml/2004172112280/extensions/amp-base-carousel/0.1/dimensions.js:97)
        at getPosition (https://raw.githubusercontent.com/ampproject/amphtml/2004172112280/extensions/amp-base-carousel/0.1/dimensions.js:155)`;

      nock('https://api.github.com')
        .post('/graphql')
        .reply(200, getGraphQLResponse('2004172112280', 'extensions/amp-base-carousel/0.1/dimensions.js'));

      const blames = blameFinder.blameForStacktrace(stacktrace);
      await expect(blames).resolves.toEqual([{
        path: 'extensions/amp-base-carousel/0.1/dimensions.js',
        startingLine: 58,
        endingLine: 58,
        author: 'rsimha',
        committedDate: new Date('2019-05-16T14:59:15Z'),
        changedFiles: 1623,
        prNumber: 21212
      }]);
    });
  });
});
