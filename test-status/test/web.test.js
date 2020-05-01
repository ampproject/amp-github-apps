/**
 * Copyright 2019, the AMP HTML authors. All Rights Reserved
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

const nock = require('nock');
const request = require('supertest');
const {dbConnect} = require('../db-connect');
const {installWebUiRouter} = require('../web');
const {Probot} = require('probot');
const {setupDb} = require('../setup-db');

const HEAD_SHA = '26ddec3fbbd3c7bd94e05a701c8b8c3ea8826faa';

jest.mock('../db-connect');
jest.mock('../auth');
jest.setTimeout(5000);
nock.disableNetConnect();
nock.enableNetConnect('127.0.0.1');

describe('test-status/web', () => {
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
    app.app = {
      getInstallationAccessToken: () => Promise.resolve('test'),
    };
  });

  beforeEach(async () => {
    process.env = {
      APPROVING_USERS: 'infrauser,anotherinfrauser',
    };

    await db('buildCop').update({username: 'buildcop'});

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
    [0, 0, /No test failures reported for unit tests \(saucelabs\)!/],
    [10, 0, /No test failures reported for unit tests \(saucelabs\)!/],
    [0, 10, /Skip these tests\?/],
    [10, 10, /Skip these tests\?/],
  ])(
    'Request status page of a check with passed/failed = %d/%d',
    async (passed, failed, bodyMatches) => {
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
        passed,
        failed,
        errored: false,
      });

      await request(probot.server)
        .get(`/tests/${HEAD_SHA}/unit/saucelabs/status`)
        .auth('buildcop')
        .expect(200, bodyMatches);
    }
  );

  test.each(['buildcop', 'infrauser', 'anotherinfrauser'])(
    'Request status page of a check that errored as %s',
    async username => {
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
        passed: null,
        failed: null,
        errored: true,
      });

      await request(probot.server)
        .get(`/tests/${HEAD_SHA}/unit/saucelabs/status`)
        .auth(username)
        .expect(200, /Errored!/);
    }
  );

  test('Request skip page for a check with failures', async () => {
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
      passed: 10,
      failed: 10,
      errored: false,
    });

    await request(probot.server)
      .get(`/tests/${HEAD_SHA}/unit/saucelabs/skip`)
      .auth('buildcop')
      .expect(200, /Really skip!/);
  });

  test.each([
    [
      '10 failed tests',
      10,
      10,
      false,
      'The unit tests (saucelabs) have previously failed on Travis.',
    ],
    [
      'tests have errored',
      null,
      null,
      true,
      'The unit tests (saucelabs) have previously errored on Travis.',
    ],
  ])('Post skip form on %s', async (_, passed, failed, errored, summary) => {
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
      passed,
      failed,
      errored,
    });

    nock('https://api.github.com')
      .patch('/repos/ampproject/amphtml/check-runs/555555', body => {
        expect(body).toMatchObject({
          conclusion: 'success',
          output: {
            title: 'Skipped by @buildcop',
            summary,
            text: expect.stringContaining(
              'The reason given was: *flaky tests*'
            ),
          },
        });
        return true;
      })
      .reply(200);

    await request(probot.server)
      .post(`/tests/${HEAD_SHA}/unit/saucelabs/skip`)
      .type('form')
      .send({reason: 'flaky tests'})
      .auth('buildcop')
      .expect(response => {
        expect(response.status).toBe(302);
        expect(response.get('location')).toBe(
          'https://github.com/ampproject/amphtml/pull/19621'
        );
      });
  });

  test('Post skip form with missing reason', async () => {
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
      passed: 10,
      failed: 10,
      errored: false,
    });

    await request(probot.server)
      .post(`/tests/${HEAD_SHA}/unit/saucelabs/skip`)
      .auth('buildcop')
      .expect(200, /Reason must not be empty/);
  });

  test('Request skip page of a check that has no failures', async () => {
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
      passed: 10,
      failed: 0,
      errored: false,
    });

    await request(probot.server)
      .get(`/tests/${HEAD_SHA}/unit/saucelabs/skip`)
      .auth('buildcop')
      .expect(400, /unit tests \(saucelabs\) for 26ddec3 have no failures/);

    await request(probot.server)
      .post(`/tests/${HEAD_SHA}/unit/saucelabs/skip`)
      .auth('buildcop')
      .expect(400, /unit tests \(saucelabs\) for 26ddec3 have no failures/);
  });

  test.each(['status', 'skip'])(
    'Request %s page of a check that was created, but no results reported yet',
    async action => {
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
        passed: null,
        failed: null,
        errored: null,
      });

      await request(probot.server)
        .get(`/tests/${HEAD_SHA}/unit/saucelabs/${action}`)
        .auth('buildcop')
        .expect(404, /have not yet been reported/);
    }
  );

  test.each(['status', 'skip'])(
    'Request %s page of a head SHA that does not exist',
    async action => {
      await request(probot.server)
        .get(`/tests/${HEAD_SHA}/unit/saucelabs/${action}`)
        .auth('buildcop')
        .expect(404, /have not yet been reported/);
    }
  );

  test.each(['status', 'skip'])(
    'Request %s page when not logged in',
    async action => {
      await request(probot.server)
        .get(`/tests/${HEAD_SHA}/unit/saucelabs/${action}`)
        .expect(response => {
          expect(response.status).toBe(302);
          expect(response.get('location')).toBe('/login');
        });
    }
  );

  test.each(['status', 'skip'])(
    'Request %s page when logged in, but not as buildcop',
    async action => {
      await request(probot.server)
        .get(`/tests/${HEAD_SHA}/unit/saucelabs/${action}`)
        .auth('notbuildcop')
        .expect(403, /You are logged in as <em>notbuildcop<\/em>/);
    }
  );

  test('Post to skip page when not logged in', async () => {
    await request(probot.server)
      .post(`/tests/${HEAD_SHA}/unit/saucelabs/skip`)
      .expect(response => {
        expect(response.status).toBe(302);
        expect(response.get('location')).toBe('/login');
      });
  });
});
