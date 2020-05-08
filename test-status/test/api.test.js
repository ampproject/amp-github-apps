/**
 * Copyright 2019 The AMP HTML Authors. All Rights Reserved.
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

const nock = require('nock');
const request = require('supertest');
const {dbConnect} = require('../db-connect');
const {installApiRouter} = require('../api');
const {Probot} = require('probot');
const {setupDb} = require('../setup-db');

const HEAD_SHA = '26ddec3fbbd3c7bd94e05a701c8b8c3ea8826faa';
const travisJobUrl =
  'https://travis-ci.org/github/ampproject/amphtml/builds/123456789';

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
          'head_sha': HEAD_SHA,
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
    nocks.done();
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
          'head_sha': HEAD_SHA,
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
    nocks.done();
  });

  test.each([
    [0, 0, '0 tests passed'],
    [1, 0, '1 test passed'],
  ])(
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
        .send({travisJobUrl})
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
      nocks.done();
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
            conclusion: 'action_required',
            output: {
              title,
            },
          });
          expect(body.output.text).toContain(
            'Contact the weekly build cop (@ampproject/build-cop)'
          );
          return true;
        })
        .reply(200);

      await request(probot.server)
        .post(`/v0/tests/${HEAD_SHA}/unit/saucelabs/report/${passed}/${failed}`)
        .send({travisJobUrl})
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
      nocks.done();
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
          output: {
            title: 'Tests have errored',
          },
        });
        expect(body.output.text).toContain(
          'Contact the weekly build cop (@ampproject/build-cop)'
        );
        return true;
      })
      .reply(200);

    await request(probot.server)
      .post(`/v0/tests/${HEAD_SHA}/unit/saucelabs/report/errored`)
      .send({travisJobUrl})
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
    nocks.done();
  });

  test('404 for /queued action when pull request was not created', async () => {
    await request(probot.server)
      .post(`/v0/tests/${HEAD_SHA}/unit/saucelabs/queued`)
      .expect(404, new RegExp(HEAD_SHA));
  });

  test.each(['started', 'skipped', 'report/5/0', 'report/errored'])(
    '404 for /%s action when pull request was not created',
    async action => {
      await request(probot.server)
        .post(`/v0/tests/${HEAD_SHA}/unit/saucelabs/${action}`)
        .send({travisJobUrl})
        .expect(404, new RegExp(HEAD_SHA));
    }
  );

  test('reject non-Travis IP addresses', async () => {
    process.env['TRAVIS_IP_ADDRESSES'] = '999.999.999.999,123.456.789.012';
    await request(probot.server)
      .post(`/v0/tests/${HEAD_SHA}/unit/saucelabs/queued`)
      .expect(403, 'You are not Travis!');
  });
});
