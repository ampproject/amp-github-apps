/**
 * Copyright 2019 The AMP HTML Authors.
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
const sinon = require('sinon');
const {Probot} = require('probot');
const owners = require('..');
const {CheckRun, GitHub, Review} = require('../src/github');

const checkRunsListResponse = require('./fixtures/check-runs/check-runs.get.35.multiple');
const checkRunsEmptyResponse = require('./fixtures/check-runs/check-runs.get.35.empty');
const reviewsApprovedResponse = require('./fixtures/reviews/reviews.35.approved.json');
const reviewsChangesResponse = require('./fixtures/reviews/reviews.35.changes_requested.json');

nock.disableNetConnect();

describe('check run', () => {
  describe('json', () => {
    it('produces a JSON object in the GitHub API format', () => {
      const checkRun = new CheckRun(true, 'Test text');
      const checkRunJson = checkRun.json;
      expect(checkRunJson.name).toEqual('ampproject/owners-check');
      expect(checkRunJson.status).toEqual('completed');
      expect(checkRunJson.conclusion).toEqual('neutral');
      expect(checkRunJson.output.title).toEqual('ampproject/owners-check');
      expect(checkRunJson.output.text).toEqual('Test text');
    });

    it('produces a the output summary based on the passing status', () => {
      const passingCheckRun = new CheckRun(true, '');
      const failingCheckRun = new CheckRun(false, '');
      expect(passingCheckRun.json.output.summary).toEqual(
        'The check was a success!'
      );
      expect(failingCheckRun.json.output.summary).toEqual(
        'The check was a failure!'
      );
    });
  });
});

describe('review', () => {
  it('initializes its approval state', () => {
    const timestamp = '2019-01-01T00:00:00Z';
    const approval = new Review('a_user', 'APPROVED', timestamp);
    const rejection = new Review('a_user', 'CHANGES_REQUESTED', timestamp);

    expect(approval.reviewer).toEqual('a_user');
    expect(approval.submittedAt).toEqual(timestamp);
    expect(approval.isApproved).toBe(true);
    expect(rejection.isApproved).toBe(false);
  });
});

describe('GitHub API', () => {
  let probot;
  let app;
  let sandbox;

  beforeEach(() => {
    probot = new Probot({});
    app = probot.load(owners);
    sandbox = sinon.createSandbox();

    app.app = () => 'test';
  });

  afterEach(() => {
    sandbox.restore();
  });

  function withContext(testFn) {
    return async () => {
      app.on('test_event', async context => {
        sandbox.stub(context, 'repo').returns({
          repo: 'test_repo',
          owner: 'test_owner',
        });
        await testFn(context, GitHub.fromContext(context));
      });
      await probot.receive({name: 'test_event', payload: {}});
    };
  }

  describe('fromContext', () => {
    it(
      'initializes a GitHub API interface',
      withContext(context => {
        const github = GitHub.fromContext(context);
        expect(github.client).toBe(context.github);
        expect(github.owner).toEqual('test_owner');
        expect(github.repository).toEqual('test_repo');
        expect(github.logger).toBe(context.log);
      })
    );
  });

  describe('repo', () => {
    it(
      'returns the repo and owner',
      withContext((context, github) => {
        const repoInfo = github.repo();
        expect(repoInfo.owner).toEqual('test_owner');
        expect(repoInfo.repo).toEqual('test_repo');
      })
    );

    it(
      'sets the repo and owner on an object',
      withContext((context, github) => {
        const repoInfo = github.repo({key: 'value', owner: 'old_owner'});
        expect(repoInfo.key).toEqual('value');
        expect(repoInfo.owner).toEqual('test_owner');
      })
    );
  });

  // TODO: implement & test.
  describe('getPullRequest', () => {});

  describe('getReviews', () => {
    it('fetches a list of reviews', async () => {
      nock('https://api.github.com')
        .get('/repos/test_owner/test_repo/pulls/35/reviews')
        .reply(200, reviewsApprovedResponse);

      await withContext(async (context, github) => {
        const legacyReviews = await github.getReviews(35);
        const review = legacyReviews[0];
        expect(review.username).toEqual('erwinmombay');
        expect(review.state).toEqual('approved');
        expect(review.submitted_at).toEqual('2019-02-26T20:39:13Z');
      });
    });
  });

  describe('createCheckRun', () => {
    it('creates a check-run for the commit', async () => {
      nock('https://api.github.com')
        .post('/repos/test_owner/test_repo/check-runs', body => {
          expect(body).toMatchObject({
            head_sha: '_test_hash_',
            head_branch: 'test_branch',
            name: 'ampproject/owners-check',
            status: 'completed',
            conclusion: 'neutral',
            output: {
              title: 'ampproject/owners-check',
              summary: 'The check was a success!',
              text: 'Test text',
            },
          });
          return true;
        })
        .reply(200);

      await withContext(async (context, github) => {
        await github.createCheckRun(
          'test_branch',
          '_test_hash_',
          new CheckRun(true, 'Test text')
        );
      })();
    });
  });

  describe('getCheckRunId', () => {
    it('fetches the first matching check-run from the list', async () => {
      const sha = '9272f18514cbd3fa935b3ced62ae1c2bf6efa76d';
      nock('https://api.github.com')
        .get(`/repos/test_owner/test_repo/commits/${sha}/check-runs`)
        .reply(200, checkRunsListResponse);

      await withContext(async (context, github) => {
        const checkRunId = await github.getCheckRunId(sha);
        // ID pulled from check-runs.get.35.multiple
        expect(checkRunId).toEqual(53472315);
      })();
    });

    it('returns undefined if the list has no matching check-run', async () => {
      nock('https://api.github.com')
        .get('/repos/test_owner/test_repo/commits/_missing_hash_/check-runs')
        .reply(200, checkRunsListResponse);

      await withContext(async (context, github) => {
        const checkRun = await github.getCheckRunId('_missing_hash_');
        expect(checkRun).toBeNull();
      })();
    });

    it('returns undefined if the list is empty', async () => {
      nock('https://api.github.com')
        .get('/repos/test_owner/test_repo/commits/_test_hash_/check-runs')
        .reply(200, checkRunsEmptyResponse);

      await withContext(async (context, github) => {
        const checkRun = await github.getCheckRunId('_test_hash_');
        expect(checkRun).toBeNull();
      })();
    });
  });

  describe('updateCheckRun', () => {
    it('updates a check-run by ID', async () => {
      nock('https://api.github.com')
        .patch('/repos/test_owner/test_repo/check-runs/1337', body => {
          expect(body).toMatchObject({
            name: 'ampproject/owners-check',
            status: 'completed',
            conclusion: 'neutral',
            output: {
              title: 'ampproject/owners-check',
              summary: 'The check was a failure!',
              text: 'Test text',
            },
          });
          return true;
        })
        .reply(200);

      await withContext(async (context, github) => {
        await github.updateCheckRun(1337, new CheckRun(false, 'Test text'));
      })();
    });
  });
});
