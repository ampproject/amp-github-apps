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

import {createTokenAuth} from '@octokit/auth';
import nock from 'nock';
import {Octokit} from '@octokit/rest';

import {GitHub} from '../src/github';

describe('GitHub interface', () => {
  const githubClient: Octokit = new Octokit({
    authStrategy: createTokenAuth,
    auth: '_TOKEN_',
  });
  let github: GitHub;

  beforeAll(() => {
    nock.disableNetConnect();
  });

  afterAll(() => {
    nock.enableNetConnect();
  });

  beforeEach(() => {
    nock.cleanAll();
    github = new GitHub(githubClient, 'test_org', 'test_repo');
  });

  afterEach(() => {
    // Fail the test if there were unused nocks.
    if (!nock.isDone()) {
      throw new Error('Not all nock interceptors were used!');
    }
    nock.cleanAll();
  });

  describe('addComment', () => {
    it('POSTs /repos/:owner/:repo/issues/:issue_number/comments', async done => {
      nock('https://api.github.com')
        .post('/repos/test_org/test_repo/issues/1337/comments', body => {
          expect(body).toEqual({body: 'Test comment'});
          return true;
        })
        .reply(200);

      await github.addComment(1337, 'Test comment');
      done();
    });
  });

  describe('updatePullBody', () => {
    it('PATCHes /repos/:owner/:repo/pulls/:pull_number', async done => {
      nock('https://api.github.com')
        .patch('/repos/test_org/test_repo/pulls/1337', ({body}) => {
          expect(body).toEqual('Test description');
          return true;
        })
        .reply(200);

      await github.updatePullBody(1337, 'Test description');
      done();
    });
  });

  describe('findNewDirectory', () => {
    describe('without regex match', () => {
      it('GETs /repos/:owner/:repo/pulls/:pull/files', async done => {
        nock('https://api.github.com')
          .get('/repos/test_org/test_repo/pulls/1337/files')
          .reply(200, [{filename: 'foo/bar'}, {filename: 'tacos/no/1'}]);

        expect(await github.findNewDirectory(1337, /no-match/)).toBeFalsy();

        done();
      });

      it('GETs (once) /repos/:owner/:repo/pulls/:pull/files', async done => {
        nock('https://api.github.com')
          .get('/repos/test_org/test_repo/pulls/1337/files')
          .once()
          .reply(200, [{filename: 'foo'}]);

        expect(await github.findNewDirectory(1337, /no-match/)).toBeFalsy();
        expect(await github.findNewDirectory(1337, /no-match/)).toBeFalsy();
        expect(await github.findNewDirectory(1337, /no-match/)).toBeFalsy();

        done();
      });
    });

    describe('with regex match', () => {
      const pathA = new RegExp('^a/([^/]+)/c');
      const pathXY = new RegExp('^x/y/([^/]+)/');
      const finds = ['x/y/added-1/file', 'x/y', 'added-1'];

      describe.each([
        {finds, contents: [404]},
        {finds, contents: [200, []]},
        {finds, contents: [200, [{name: 'foo'}, {name: 'bar'}]]},
        {contents: [200, [{name: 'added-1'}]]},
      ])(
        'GETs /repos/:owner/:repo/contents/:path',
        ({
          contents,
          finds,
        }: {
          finds: string[] | undefined;
          contents: [number, {name: string}[] | undefined];
        }) => {
          it(`does${!finds ? ' not' : ''} find when replying ${JSON.stringify(
            contents
          )}`, async done => {
            nock('https://api.github.com')
              .get('/repos/test_org/test_repo/pulls/1337/files')
              .reply(200, [
                {filename: 'a/b/c'},
                {filename: 'x/y/added-1/file'},
              ]);

            nock('https://api.github.com')
              .get('/repos/test_org/test_repo/contents/x/y')
              .reply(...contents);

            const result = await github.findNewDirectory(1337, pathXY);
            expect(result).toEqual(finds);

            done();
          });
        }
      );

      it('GETs (once) /repos/:owner/:repo/contents/:path', async done => {
        nock('https://api.github.com')
          .get('/repos/test_org/test_repo/pulls/1337/files')
          .reply(200, [{filename: 'a/b/c'}, {filename: 'x/y/added-1/file'}]);

        nock('https://api.github.com')
          .get('/repos/test_org/test_repo/contents/x/y')
          .once()
          .reply(200, []);

        expect(await github.findNewDirectory(1337, pathXY)).toEqual(finds);
        expect(await github.findNewDirectory(1337, pathXY)).toEqual(finds);
        expect(await github.findNewDirectory(1337, pathXY)).toEqual(finds);

        nock('https://api.github.com')
          .get('/repos/test_org/test_repo/contents/a')
          .once()
          .reply(200, [{name: 'b'}]);

        expect(await github.findNewDirectory(1337, pathA)).toEqual(undefined);
        expect(await github.findNewDirectory(1337, pathA)).toEqual(undefined);
        expect(await github.findNewDirectory(1337, pathA)).toEqual(undefined);

        done();
      });
    });
  });
});
