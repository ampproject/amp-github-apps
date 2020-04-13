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

import {BlameFinder} from '../src/blame_finder';
import {getGraphQLResponse} from './fixtures';

import nock from 'nock';

describe('BlameFinder', () => {
  let blameFinder: BlameFinder;

  beforeAll(() => {
    nock.disableNetConnect();
  });

  afterAll(() => {
    nock.enableNetConnect();
  });

  beforeEach(() => {
    blameFinder = new BlameFinder('test_org', 'test_repo', '__TOKEN__');
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
      const path = 'extensions/amp-next-page/1.0/service.js'

      nock('https://api.github.com')
        .post('/graphql', ({query}) => {
          expect(query).toContain(`ref(qualifiedName: "${rtv}")`)
          expect(query).toContain(`blame(path: "${path}"`);
          return true;
        })
        .reply(200, getGraphQLResponse(rtv, path));

      await blameFinder.blameForFile(rtv, path);
    });

    it('caches blame queries for rtv-path pairs', async () => {
      const path = 'extensions/amp-next-page/1.0/service.js'

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
          expect(query).toContain(`ref(qualifiedName: "not-a-ref")`)
          expect(query).toContain(`blame(path: "${path}"`);
          return true;
        })
        .reply(200, getGraphQLResponse('not-a-ref', path))
        .post('/graphql', ({query}) => {
          expect(query).toContain(`ref(qualifiedName: "master")`)
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
        .reply(200, getGraphQLResponse(rtv, path))

      const ranges = await blameFinder.blameForFile(rtv, path);
      expect(ranges[0]).toMatchObject({
        path: 'extensions/amp-next-page/1.0/service.js',
        startingLine: 1,
        endingLine: 16,

        author: 'wassgha',
        committedDate: new Date("2019-12-10T07:48:41Z"),
        changedFiles: 11,
        prNumber: 25636,
      });
    });
  });
});
