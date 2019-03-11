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
const {installApiRouter} = require('../api');
const nock = require('nock');
const {Probot} = require('probot');
const request = require('supertest');
const {setupDb} = require('../setup-db');
const {waitUntilNockScopeIsDone} = require('./_test_helper');

const HEAD_SHA = '26ddec3fbbd3c7bd94e05a701c8b8c3ea8826faa';

jest.mock('../db-connect');
jest.setTimeout(5000);
nock.disableNetConnect();
nock.enableNetConnect('127.0.0.1');

describe('test-status/api', async () => {
  let probot;
  let app;
  const db = dbConnect();

  beforeAll(async () => {
    await setupDb(db);

    probot = new Probot({});
    app = probot.load(app => {
      installApiRouter(app, db);
    });

    // Return a test token.
    app.app = () => 'test';
  });

  beforeEach(async () => {
    process.env = {
      WEB_UI_BASE_URL: 'http://localhost:3000/',
    };

    nock('https://api.github.com')
        .post('/app/installations/123456/access_tokens')
        .reply(200, {token: 'test'});
  });

  afterEach(async () => {
    await db('pull_request_snapshots').truncate();
    await db('checks').truncate();
  });

  afterAll(async () => {
    await db.destroy();
  });

  test.each([
    ['queued', 'queued', 'unit tests are queued on Travis'],
    ['skipped', 'completed', 'unit tests were not required'],
  ])('Create a new check with /%s action', async (action, status, title) => {
    await db('pull_request_snapshots').insert({
      head_sha: HEAD_SHA,
      owner: 'ampproject',
      repo: 'amphtml',
      pull_request_id: 19621,
      installation_id: 123456,
    });

    const nocks = nock('https://api.github.com')
        .post('/repos/ampproject/amphtml/check-runs', body => {
          expect(body).toMatchObject({
            name: 'ampproject/tests/unit',
            head_sha: HEAD_SHA,
            status,
            output: {
              title,
            },
          });
          return true;
        })
        .reply(200, {id: 555555});

    await request(probot.server)
        .post(`/v0/tests/${HEAD_SHA}/unit/${action}`)
        .expect(200);

    expect(await db('checks').select('*')).toMatchObject([{
      head_sha: HEAD_SHA,
      type: 'unit',
      check_run_id: 555555,
      passed: null,
      failed: null,
    }]);

    await waitUntilNockScopeIsDone(nocks);
  });

  test('Update an existing check with /started action', async () => {
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

    const nocks = nock('https://api.github.com')
        .patch('/repos/ampproject/amphtml/check-runs/555555', body => {
          expect(body).toMatchObject({
            head_sha: HEAD_SHA,
            status: 'in_progress',
            output: {
              title: 'unit tests are running on Travis',
            },
          });
          return true;
        })
        .reply(200);

    await request(probot.server)
        .post(`/v0/tests/${HEAD_SHA}/unit/started`)
        .expect(200);
    await waitUntilNockScopeIsDone(nocks);
  });

  test.each([
    [0, 0, 'success', '0 unit tests passed', null],
    [1, 0, 'success', '1 unit test passed', null],
    [5, 5, 'action_required', '5 unit tests failed',
      `http://localhost:3000/tests/${HEAD_SHA}/unit/status`],
    [0, 1, 'action_required', '1 unit test failed',
      `http://localhost:3000/tests/${HEAD_SHA}/unit/status`],
  ])('Update an existing check with /report/%d/%d action',
      async (passed, failed, conclusion, title, detailsUrl) => {
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

        const nocks = nock('https://api.github.com')
            .patch('/repos/ampproject/amphtml/check-runs/555555', body => {
              expect(body).toMatchObject({
                status: 'completed',
                conclusion,
                output: {
                  title,
                },
              });
              if (detailsUrl) {
                expect(body).toMatchObject({
                  details_url: detailsUrl,
                });
              }
              return true;
            })
            .reply(200);

        await request(probot.server)
            .post(`/v0/tests/${HEAD_SHA}/unit/report/${passed}/${failed}`)
            .expect(200);

        expect(await db('checks').select('*')).toMatchObject([{
          head_sha: HEAD_SHA,
          type: 'unit',
          check_run_id: 555555,
          passed,
          failed,
        }]);

        await waitUntilNockScopeIsDone(nocks);
      });

  test.each([
    'queued',
    'started',
    'skipped',
    'report/5/0',
  ])('404 for /%s action when pull request was not created', async action => {
    await request(probot.server)
        .post(`/v0/tests/${HEAD_SHA}/unit/${action}`)
        .expect(404, new RegExp(HEAD_SHA));
  });

  test('reject non-Travis IP addresses', async () => {
    process.env['TRAVIS_IP_ADDRESSES'] = '999.999.999.999,123.456.789.012';
    await request(probot.server)
        .post(`/v0/tests/${HEAD_SHA}/unit/queued`)
        .expect(403, 'You are not Travis!');
  });
});
