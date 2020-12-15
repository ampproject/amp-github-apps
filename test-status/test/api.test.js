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
const ciJobUrl =
  'https://app.circleci.com/pipelines/github/ampproject/amphtml/12345/workflows/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee/jobs/12345';

jest.mock('../db-connect');
jest.setTimeout(5000);
nock.disableNetConnect();
nock.enableNetConnect('127.0.0.1');

describe('test-status/api', () => {
  let github;
  let probot;
  let app;
  const db = dbConnect();

  beforeAll(async () => {
    await setupDb(db);
  });

  beforeEach(() => {
    github = {
      checks: {
        create: jest.fn(),
        update: jest.fn(),
      },
    };

    class Octokit {
      constructor() {}

      static defaults() {
        return this;
      }

      get checks() {
        return github.checks;
      }
    }

    probot = new Probot({Octokit});
    app = probot.load(app => {
      installApiRouter(app, db);
    });
    app.auth = () => github;
  });

  afterEach(async () => {
    await db('pullRequestSnapshots').truncate();
    await db('checks').truncate();
  });

  afterAll(async () => {
    await db.destroy();
  });

  test.each([
    ['queued', 'queued', 'Tests are queued'],
    ['skipped', 'completed', 'Tests were not required'],
  ])('Create a new check with /%s action', async (action, status, title) => {
    await db('pullRequestSnapshots').insert({
      headSha: HEAD_SHA,
      owner: 'ampproject',
      repo: 'amphtml',
      pullRequestId: 19621,
      installationId: 123456,
    });

    github.checks.create.mockResolvedValue({data: {id: 555555}});

    await request(probot.server)
      .post(`/v0/tests/${HEAD_SHA}/unit/local/${action}`)
      .expect(200);

    expect(await db('checks').select('*')).toMatchObject([
      {
        headSha: HEAD_SHA,
        type: 'unit',
        subType: 'local',
        checkRunId: 555555,
        passed: null,
        failed: null,
        errored: null,
      },
    ]);

    expect(github.checks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'ampproject/tests/unit (local)',
        head_sha: HEAD_SHA,
        status,
        output: {
          title,
        },
      })
    );
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
      subType: 'local',
      checkRunId: 555555,
    });

    await request(probot.server)
      .post(`/v0/tests/${HEAD_SHA}/unit/local/started`)
      .expect(200);

    expect(github.checks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        head_sha: HEAD_SHA,
        status: 'in_progress',
        output: {
          title: 'Tests are running',
        },
      })
    );
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
        subType: 'local',
        checkRunId: 555555,
      });

      await request(probot.server)
        .post(`/v0/tests/${HEAD_SHA}/unit/local/report/${passed}/${failed}`)
        .send({ciJobUrl})
        .expect(200);

      expect(await db('checks').select('*')).toMatchObject([
        {
          headSha: HEAD_SHA,
          type: 'unit',
          subType: 'local',
          checkRunId: 555555,
          passed,
          failed,
          errored: 0,
        },
      ]);

      expect(github.checks.update).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'completed',
          conclusion: 'success',
          output: {
            title,
          },
        })
      );
    }
  );

  test.each([
    [
      5,
      5,
      '5 tests failed',
      `http://localhost:3000/tests/${HEAD_SHA}/unit/local/status`,
    ],
    [
      0,
      1,
      '1 test failed',
      `http://localhost:3000/tests/${HEAD_SHA}/unit/local/status`,
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
        subType: 'local',
        checkRunId: 555555,
      });

      await request(probot.server)
        .post(`/v0/tests/${HEAD_SHA}/unit/local/report/${passed}/${failed}`)
        .send({ciJobUrl})
        .expect(200);

      expect(await db('checks').select('*')).toMatchObject([
        {
          headSha: HEAD_SHA,
          type: 'unit',
          subType: 'local',
          checkRunId: 555555,
          passed,
          failed,
          errored: 0,
        },
      ]);

      expect(github.checks.update).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'completed',
          conclusion: 'action_required',
          output: {
            title,
            text: expect.stringContaining(
              'Contact the weekly build cop (@ampproject/build-cop)'
            ),
          },
        })
      );
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
      subType: 'local',
      checkRunId: 555555,
    });

    await request(probot.server)
      .post(`/v0/tests/${HEAD_SHA}/unit/local/report/errored`)
      .send({ciJobUrl})
      .expect(200);

    expect(await db('checks').select('*')).toMatchObject([
      {
        headSha: HEAD_SHA,
        type: 'unit',
        subType: 'local',
        checkRunId: 555555,
        passed: null,
        failed: null,
        errored: 1,
      },
    ]);

    expect(github.checks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'completed',
        conclusion: 'action_required',
        output: {
          title: 'Tests have errored',
          text: expect.stringContaining(
            'Contact the weekly build cop (@ampproject/build-cop)'
          ),
        },
      })
    );
  });

  test('404 for /queued action when pull request was not created', async () => {
    await request(probot.server)
      .post(`/v0/tests/${HEAD_SHA}/unit/local/queued`)
      .expect(404, new RegExp(HEAD_SHA));
  });

  test.each(['started', 'skipped', 'report/5/0', 'report/errored'])(
    '404 for /%s action when pull request was not created',
    async action => {
      await request(probot.server)
        .post(`/v0/tests/${HEAD_SHA}/unit/local/${action}`)
        .send({ciJobUrl})
        .expect(404, new RegExp(HEAD_SHA));
    }
  );
});
