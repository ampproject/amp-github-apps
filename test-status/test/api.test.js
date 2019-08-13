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

describe('test-status/api', () => {
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
    app.app = {
      getInstallationAccessToken: () => Promise.resolve('test'),
    };
  });

  beforeEach(async () => {
    process.env = {
      WEB_UI_BASE_URL: 'http://localhost:3000/',
      BUILD_COP_UPDATE_TOKEN: '1a2b3c',
    };

    await db('buildCop').update({username: 'agithuber'});

    nock('https://api.github.com')
      .post('/app/installations/123456/access_tokens')
      .reply(200, {token: 'test'});
  });

  afterEach(async () => {
    await db('pullRequestSnapshots').truncate();
    await db('checks').truncate();
  });

  afterAll(async () => {
    await db.destroy();
  });

  test.each([
    ['queued', 'queued', 'Tests are queued on Travis'],
    ['skipped', 'completed', 'Tests were not required'],
  ])('Create a new check with /%s action', async (action, status, title) => {
    await db('pullRequestSnapshots').insert({
      headSha: HEAD_SHA,
      owner: 'ampproject',
      repo: 'amphtml',
      pullRequestId: 19621,
      installationId: 123456,
    });

    const nocks = nock('https://api.github.com')
      .post('/repos/ampproject/amphtml/check-runs', body => {
        expect(body).toMatchObject({
          name: 'ampproject/tests/unit (saucelabs)',
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
      .post(`/v0/tests/${HEAD_SHA}/unit/saucelabs/${action}`)
      .expect(200);

    expect(await db('checks').select('*')).toMatchObject([
      {
        headSha: HEAD_SHA,
        type: 'unit',
        subType: 'saucelabs',
        checkRunId: 555555,
        passed: null,
        failed: null,
        errored: null,
      },
    ]);

    await waitUntilNockScopeIsDone(nocks);
  });

  test('Update an existing check with /started action', async () => {
    await db('pullRequestSnapshots').insert({
      headSha: HEAD_SHA,
      owner: 'ampproject',
      repo: 'amphtml',
      pullRequestId: 19621,
      installationId: 123456,
    });
    await db('checks').insert({
      headSha: HEAD_SHA,
      type: 'unit',
      subType: 'saucelabs',
      checkRunId: 555555,
    });

    const nocks = nock('https://api.github.com')
      .patch('/repos/ampproject/amphtml/check-runs/555555', body => {
        expect(body).toMatchObject({
          head_sha: HEAD_SHA,
          status: 'in_progress',
          output: {
            title: 'Tests are running on Travis',
          },
        });
        return true;
      })
      .reply(200);

    await request(probot.server)
      .post(`/v0/tests/${HEAD_SHA}/unit/saucelabs/started`)
      .expect(200);
    await waitUntilNockScopeIsDone(nocks);
  });

  test.each([[0, 0, '0 tests passed'], [1, 0, '1 test passed']])(
    'Update a successful existing check with /report/%d/%d action',
    async (passed, failed, title) => {
      await db('pullRequestSnapshots').insert({
        headSha: HEAD_SHA,
        owner: 'ampproject',
        repo: 'amphtml',
        pullRequestId: 19621,
        installationId: 123456,
      });
      await db('checks').insert({
        headSha: HEAD_SHA,
        type: 'unit',
        subType: 'saucelabs',
        checkRunId: 555555,
      });

      const nocks = nock('https://api.github.com')
        .patch('/repos/ampproject/amphtml/check-runs/555555', body => {
          expect(body).toMatchObject({
            status: 'completed',
            conclusion: 'success',
            output: {
              title,
            },
          });
          return true;
        })
        .reply(200);

      await request(probot.server)
        .post(`/v0/tests/${HEAD_SHA}/unit/saucelabs/report/${passed}/${failed}`)
        .expect(200);

      expect(await db('checks').select('*')).toMatchObject([
        {
          headSha: HEAD_SHA,
          type: 'unit',
          subType: 'saucelabs',
          checkRunId: 555555,
          passed,
          failed,
          errored: 0,
        },
      ]);

      await waitUntilNockScopeIsDone(nocks);
    }
  );

  test.each([
    [
      5,
      5,
      '5 tests failed',
      `http://localhost:3000/tests/${HEAD_SHA}/unit/saucelabs/status`,
    ],
    [
      0,
      1,
      '1 test failed',
      `http://localhost:3000/tests/${HEAD_SHA}/unit/saucelabs/status`,
    ],
  ])(
    'Update a failed existing check with /report/%d/%d action',
    async (passed, failed, title, detailsUrl) => {
      await db('pullRequestSnapshots').insert({
        headSha: HEAD_SHA,
        owner: 'ampproject',
        repo: 'amphtml',
        pullRequestId: 19621,
        installationId: 123456,
      });
      await db('checks').insert({
        headSha: HEAD_SHA,
        type: 'unit',
        subType: 'saucelabs',
        checkRunId: 555555,
      });

      const nocks = nock('https://api.github.com')
        .patch('/repos/ampproject/amphtml/check-runs/555555', body => {
          expect(body).toMatchObject({
            status: 'completed',
            conclusion: 'action_required',
            details_url: detailsUrl,
            output: {
              title,
            },
          });
          expect(body.output.text).toContain(
            'Contact the weekly build cop (@agithuber)'
          );
          return true;
        })
        .reply(200);

      await request(probot.server)
        .post(`/v0/tests/${HEAD_SHA}/unit/saucelabs/report/${passed}/${failed}`)
        .expect(200);

      expect(await db('checks').select('*')).toMatchObject([
        {
          headSha: HEAD_SHA,
          type: 'unit',
          subType: 'saucelabs',
          checkRunId: 555555,
          passed,
          failed,
          errored: 0,
        },
      ]);

      await waitUntilNockScopeIsDone(nocks);
    }
  );

  test('Update an existing check with /report/errored action', async () => {
    await db('pullRequestSnapshots').insert({
      headSha: HEAD_SHA,
      owner: 'ampproject',
      repo: 'amphtml',
      pullRequestId: 19621,
      installationId: 123456,
    });
    await db('checks').insert({
      headSha: HEAD_SHA,
      type: 'unit',
      subType: 'saucelabs',
      checkRunId: 555555,
    });

    const nocks = nock('https://api.github.com')
      .patch('/repos/ampproject/amphtml/check-runs/555555', body => {
        expect(body).toMatchObject({
          status: 'completed',
          conclusion: 'action_required',
          details_url:
            `http://localhost:3000/tests/${HEAD_SHA}/unit/` +
            'saucelabs/status',
          output: {
            title: 'Tests have errored',
          },
        });
        expect(body.output.text).toContain(
          'Contact the weekly build cop (@agithuber)'
        );
        return true;
      })
      .reply(200);

    await request(probot.server)
      .post(`/v0/tests/${HEAD_SHA}/unit/saucelabs/report/errored`)
      .expect(200);

    expect(await db('checks').select('*')).toMatchObject([
      {
        headSha: HEAD_SHA,
        type: 'unit',
        subType: 'saucelabs',
        checkRunId: 555555,
        passed: null,
        failed: null,
        errored: 1,
      },
    ]);

    await waitUntilNockScopeIsDone(nocks);
  });

  test.each(['queued', 'started', 'skipped', 'report/5/0', 'report/errored'])(
    '404 for /%s action when pull request was not created',
    async action => {
      await request(probot.server)
        .post(`/v0/tests/${HEAD_SHA}/unit/saucelabs/${action}`)
        .expect(404, new RegExp(HEAD_SHA));
    }
  );

  test('reject non-Travis IP addresses', async () => {
    process.env['TRAVIS_IP_ADDRESSES'] = '999.999.999.999,123.456.789.012';
    await request(probot.server)
      .post(`/v0/tests/${HEAD_SHA}/unit/saucelabs/queued`)
      .expect(403, 'You are not Travis!');
  });

  test('update build cop', async () => {
    expect(await db('buildCop').pluck('username')).toMatchObject(['agithuber']);

    await request(probot.server)
      .post('/v0/build-cop/update')
      .send({
        accessToken: '1a2b3c',
        username: 'anothergithuber',
      })
      .set('Content-Type', 'application/json')
      .set('Accept', 'application/json')
      .expect(200);

    expect(await db('buildCop').pluck('username')).toMatchObject([
      'anothergithuber',
    ]);
  });

  test('reject missing access token for build cop updates', async () => {
    expect(await db('buildCop').pluck('username')).toMatchObject(['agithuber']);

    await request(probot.server)
      .post('/v0/build-cop/update')
      .send({
        username: 'anothergithuber',
      })
      .set('Content-Type', 'application/json')
      .set('Accept', 'application/json')
      .expect(403);

    expect(await db('buildCop').pluck('username')).toMatchObject(['agithuber']);
  });

  test('reject incorrect access token for build cop updates', async () => {
    expect(await db('buildCop').pluck('username')).toMatchObject(['agithuber']);

    await request(probot.server)
      .post('/v0/build-cop/update')
      .send({
        accessToken: 'THIS ACCESS TOKEN IS INCORRECT',
        username: 'anothergithuber',
      })
      .set('Content-Type', 'application/json')
      .set('Accept', 'application/json')
      .expect(403);

    expect(await db('buildCop').pluck('username')).toMatchObject(['agithuber']);
  });

  test('reject missing username for build cop updates', async () => {
    expect(await db('buildCop').pluck('username')).toMatchObject(['agithuber']);

    await request(probot.server)
      .post('/v0/build-cop/update')
      .send({
        accessToken: '1a2b3c',
      })
      .set('Content-Type', 'application/json')
      .set('Accept', 'application/json')
      .expect(400);

    expect(await db('buildCop').pluck('username')).toMatchObject(['agithuber']);
  });
});
