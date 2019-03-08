/**
 * Copyright 2019, the AMP HTML authors
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

const {dbConnect} = require('../db-connect');
const {installWebUiRouter} = require('../web');
const nock = require('nock');
const {Probot} = require('probot');
const request = require('supertest');
const {setupDb} = require('../setup-db');
const {waitUntilNockScopeIsDone} = require('./_test_helper');

const HEAD_SHA = '26ddec3fbbd3c7bd94e05a701c8b8c3ea8826faa';

jest.mock('../db-connect');
jest.mock('../auth');
jest.setTimeout(5000);
nock.disableNetConnect();
nock.enableNetConnect('127.0.0.1');

describe('test-status/web', async () => {
  let probot;
  let app;
  const db = dbConnect();

  beforeAll(async () => {
    await setupDb(db);

    probot = new Probot({});
    app = probot.load(app => {
      installWebUiRouter(app, db);
    });

    // Return a test token.
    app.app = () => 'test';
  });

  beforeEach(async () => {
    process.env = {
      APPROVING_USERS: 'buildcop',
    };
  });

  afterEach(async () => {
    await db('pull_request_snapshots').truncate();
    await db('checks').truncate();
  });

  afterAll(async () => {
    await db.destroy();
  });

  test.each([
    [0, 0, /No test failures reported for unit tests!/],
    [10, 0, /No test failures reported for unit tests!/],
    [0, 10, /Skip these tests\?/],
    [10, 10, /Skip these tests\?/],
  ])('Request status page of a check with passed/failed = %d/%d',
      async (passed, failed, bodyMatches) => {
        await db('pull_request_snapshots').insert({
          head_sha: HEAD_SHA,
          owner: 'ampproject',
          repo: 'amphtml',
          pull_request_id: 19621,
          installation_id: 123456,
        });
        await db('checks').insert({
          head_sha: HEAD_SHA,
          type: 'unit',
          check_run_id: 555555,
          passed,
          failed,
        });

        await request(probot.server)
            .get(`/tests/${HEAD_SHA}/unit/status`)
            .auth('buildcop')
            .expect(200, bodyMatches);
      });

  test('Request skip page for a check with failures', async () => {
    await db('pull_request_snapshots').insert({
      head_sha: HEAD_SHA,
      owner: 'ampproject',
      repo: 'amphtml',
      pull_request_id: 19621,
      installation_id: 123456,
    });
    await db('checks').insert({
      head_sha: HEAD_SHA,
      type: 'unit',
      check_run_id: 555555,
      passed: 10,
      failed: 10,
    });

    await request(probot.server)
        .get(`/tests/${HEAD_SHA}/unit/skip`)
        .auth('buildcop')
        .expect(200, /Really skip!/);
  });

  test('Post skip form', async () => {
    await db('pull_request_snapshots').insert({
      head_sha: HEAD_SHA,
      owner: 'ampproject',
      repo: 'amphtml',
      pull_request_id: 19621,
      installation_id: 123456,
    });
    await db('checks').insert({
      head_sha: HEAD_SHA,
      type: 'unit',
      check_run_id: 555555,
      passed: 10,
      failed: 10,
    });

    const nocks = nock('https://api.github.com')
        .post('/app/installations/123456/access_tokens')
        .reply(200, {token: 'test'})
        .patch('/repos/ampproject/amphtml/check-runs/555555', body => {
          expect(body).toMatchObject({
            conclusion: 'success',
            output: {
              title: 'Skipped by @buildcop',
              text:
                expect.stringContaining('The reason given was: *flaky tests*'),
            },
          });
          return true;
        })
        .reply(200);

    await request(probot.server)
        .post(`/tests/${HEAD_SHA}/unit/skip`)
        .type('form')
        .send({reason: 'flaky tests'})
        .auth('buildcop')
        .expect(response => {
          expect(response.status).toBe(302);
          expect(response.get('location'))
              .toBe('https://github.com/ampproject/amphtml/pull/19621');
        });
    await waitUntilNockScopeIsDone(nocks);
  });

  test('Post skip form with missing reason', async () => {
    await db('pull_request_snapshots').insert({
      head_sha: HEAD_SHA,
      owner: 'ampproject',
      repo: 'amphtml',
      pull_request_id: 19621,
      installation_id: 123456,
    });
    await db('checks').insert({
      head_sha: HEAD_SHA,
      type: 'unit',
      check_run_id: 555555,
      passed: 10,
      failed: 10,
    });

    await request(probot.server)
        .post(`/tests/${HEAD_SHA}/unit/skip`)
        .auth('buildcop')
        .expect(200, /Reason must not be empty/);
  });

  test('Request skip page of a check that has no failures', async () => {
    await db('pull_request_snapshots').insert({
      head_sha: HEAD_SHA,
      owner: 'ampproject',
      repo: 'amphtml',
      pull_request_id: 19621,
      installation_id: 123456,
    });
    await db('checks').insert({
      head_sha: HEAD_SHA,
      type: 'unit',
      check_run_id: 555555,
      passed: 10,
      failed: 0,
    });

    await request(probot.server)
        .get(`/tests/${HEAD_SHA}/unit/skip`)
        .auth('buildcop')
        .expect(400, /unit tests for 26ddec3 have no failures/);

    await request(probot.server)
        .post(`/tests/${HEAD_SHA}/unit/skip`)
        .auth('buildcop')
        .expect(400, /unit tests for 26ddec3 have no failures/);
  });

  test.each([
    'status',
    'skip',
  ])('Request %s page of a check that was created, but no results reported yet',
      async action => {
        await db('pull_request_snapshots').insert({
          head_sha: HEAD_SHA,
          owner: 'ampproject',
          repo: 'amphtml',
          pull_request_id: 19621,
          installation_id: 123456,
        });
        await db('checks').insert({
          head_sha: HEAD_SHA,
          type: 'unit',
          check_run_id: 555555,
          passed: null,
          failed: null,
        });

        await request(probot.server)
            .get(`/tests/${HEAD_SHA}/unit/${action}`)
            .auth('buildcop')
            .expect(404, /have not yet been reported/);
      });

  test.each([
    'status',
    'skip',
  ])('Request %s page of a head SHA that does not exist', async action => {
    await request(probot.server)
        .get(`/tests/${HEAD_SHA}/unit/${action}`)
        .auth('buildcop')
        .expect(404, /have not yet been reported/);
  });

  test.each([
    'status',
    'skip',
  ])('Request %s page when not logged in', async action => {
    await request(probot.server)
        .get(`/tests/${HEAD_SHA}/unit/${action}`)
        .expect(response => {
          expect(response.status).toBe(302);
          expect(response.get('location')).toBe('/login');
        });
  });

  test.each([
    'status',
    'skip',
  ])('Request %s page when logged in, but not as buildcop', async action => {
    await request(probot.server)
        .get(`/tests/${HEAD_SHA}/unit/${action}`)
        .auth('notbuildcop')
        .expect(403, /You are logged in as <em>notbuildcop<\/em>/);
  });

  test('Post to skip page when not logged in', async () => {
    await request(probot.server)
        .post(`/tests/${HEAD_SHA}/unit/skip`)
        .expect(response => {
          expect(response.status).toBe(302);
          expect(response.get('location')).toBe('/login');
        });
  });
});
