/**
 * Copyright 2018, the AMP HTML authors
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

const bundleSizeApp = require('../app');
const {dbConnect} = require('../db');
const deepcopy = require('deepcopy');
const nock = require('nock');
const {Probot} = require('probot');
const request = require('supertest');
const {setupDb} = require('../setup-db');

const nockRetryTimeoutMs = 100;
const nockMaxTimeoutMs = 10000;

nock.disableNetConnect();
nock.enableNetConnect('127.0.0.1');
jest.mock('../db');
jest.mock('sleep-promise', () => () => Promise.resolve());
jest.setTimeout(30000);

/**
 * Get a JSON test fixture object.
 *
 * Returns a copy of the object, since modifying the object that gets returned
 * via `require` directly will cause all future calls to `require(sameFile)` to
 * return the previously modified object.
 *
 * @param {!string} name name of the JSON fixture file (without .json).
 * @return {!Object} the named JSON test fixture file.
 */
function getFixture(name) {
  return deepcopy(require(`./fixtures/${name}`));
}

/**
 * Wait until the supplied nock Scope has all its network requests are satified.
 *
 * @param {!nock.Scope} nocks a nock Scope object with network expectations.
 */
async function waitUntilNockScopeIsDone(nocks) {
  const start = Date.now();
  while (Date.now() < start + nockMaxTimeoutMs && !nocks.isDone()) {
    await new Promise(resolve => setTimeout(resolve, nockRetryTimeoutMs));
  }
  nocks.done();
}

describe('bundle-size', () => {
  let probot;
  let app;
  const db = dbConnect();

  beforeAll(async () => {
    await setupDb(db);

    probot = new Probot({});
    app = probot.load(bundleSizeApp);

    // Return a test token.
    app.app = () => 'test';
  });

  beforeEach(async () => {
    process.env = {
      MAX_ALLOWED_INCREASE: '0.1',
    };

    nock('https://api.github.com')
        .post('/app/installations/123456/access_tokens')
        .reply(200, {token: 'test'});

    nock('https://api.github.com')
        .get('/repos/ampproject/amphtml-build-artifacts/contents/bundle-size/' +
             'OWNERS')
        .reply(200, getFixture('OWNERS'));
  });

  afterEach(async () => {
    await db('checks').truncate();
  });

  afterAll(async () => {
    await db.destroy();
  });

  test('create a new pending check when a pull request is opened', async () => {
    const payload = getFixture('pull_request.opened');

    const nocks = nock('https://api.github.com')
        .post('/repos/ampproject/amphtml/check-runs', body => {
          expect(body).toMatchObject({
            head_sha: '39f787c8132f9ccc956ed465c0af8bc33f641404',
            name: 'ampproject/bundle-size',
            output: {
              title: 'Calculating new bundle size for this PR…',
            },
          });
          return true;
        })
        .reply(200, {id: 555555});

    await probot.receive({name: 'pull_request', payload});
    await waitUntilNockScopeIsDone(nocks);

    expect(await db('checks').select('*')).toMatchObject([
      {
        head_sha: '39f787c8132f9ccc956ed465c0af8bc33f641404',
        owner: 'ampproject',
        repo: 'amphtml',
        pull_request_id: 19621,
        installation_id: 123456,
        check_run_id: 555555,
        delta: null,
      },
    ]);
  });

  test('update a pending check when a pull request is synced', async () => {
    await db('checks').insert({
      head_sha: '39f787c8132f9ccc956ed465c0af8bc33f641404',
      owner: 'ampproject',
      repo: 'amphtml',
      pull_request_id: 19621,
      installation_id: 123456,
      check_run_id: 444444,
      delta: null,
    });

    const payload = getFixture('pull_request.opened');

    const nocks = nock('https://api.github.com')
        .post('/repos/ampproject/amphtml/check-runs', body => {
          expect(body).toMatchObject({
            head_sha: '39f787c8132f9ccc956ed465c0af8bc33f641404',
            name: 'ampproject/bundle-size',
            output: {
              title: 'Calculating new bundle size for this PR…',
            },
          });
          return true;
        })
        .reply(200, {id: 555555});

    await probot.receive({name: 'pull_request', payload});
    await waitUntilNockScopeIsDone(nocks);

    expect(await db('checks').select('*')).toMatchObject([
      {
        head_sha: '39f787c8132f9ccc956ed465c0af8bc33f641404',
        owner: 'ampproject',
        repo: 'amphtml',
        pull_request_id: 19621,
        installation_id: 123456,
        check_run_id: 555555,
        delta: null,
      },
    ]);
  });

  test('mark a check as successful when an OWNERS approves PR', async () => {
    const payload = getFixture('pull_request_review.submitted');

    await db('checks').insert({
      head_sha: '26ddec3fbbd3c7bd94e05a701c8b8c3ea8826faa',
      owner: 'ampproject',
      repo: 'amphtml',
      pull_request_id: 19603,
      installation_id: 123456,
      check_run_id: 555555,
      delta: 0.2,
    });

    const nocks = nock('https://api.github.com')
        .patch('/repos/ampproject/amphtml/check-runs/555555', body => {
          expect(body).toMatchObject({
            conclusion: 'success',
            output: {
              title: 'Δ +0.20KB | approved by @aghassemi',
            },
          });
          return true;
        })
        .reply(200);

    await probot.receive({name: 'pull_request_review', payload});
    await waitUntilNockScopeIsDone(nocks);
  });

  test('mark a check as successful when an OWNERS approves PR with missing ' +
      'size delta', async () => {
    const payload = getFixture('pull_request_review.submitted');

    await db('checks').insert({
      head_sha: '26ddec3fbbd3c7bd94e05a701c8b8c3ea8826faa',
      owner: 'ampproject',
      repo: 'amphtml',
      pull_request_id: 19603,
      installation_id: 123456,
      check_run_id: 555555,
      delta: null,
    });

    const nocks = nock('https://api.github.com')
        .patch('/repos/ampproject/amphtml/check-runs/555555', body => {
          expect(body).toMatchObject({
            conclusion: 'success',
            output: {
              title: 'Δ ±?.??KB | approved by @aghassemi',
            },
          });
          return true;
        })
        .reply(200);

    await probot.receive({name: 'pull_request_review', payload});
    await waitUntilNockScopeIsDone(nocks);
  });

  test('ignore an approved review by a non-OWNERS person', async () => {
    const payload = getFixture('pull_request_review.submitted');
    payload.review.user.login = 'rsimha';

    await probot.receive({name: 'pull_request_review', payload});
  });

  test('ignore a "changes requested" review', async () => {
    const payload = getFixture('pull_request_review.submitted');
    payload.state = 'changes_requested';

    await probot.receive({name: 'pull_request_review', payload});
  });

  test('ignore an approved review by an OWNERS for small delta', async () => {
    const payload = getFixture('pull_request_review.submitted');

    await db('checks').insert({
      head_sha: '26ddec3fbbd3c7bd94e05a701c8b8c3ea8826faa',
      owner: 'ampproject',
      repo: 'amphtml',
      pull_request_id: 19603,
      installation_id: 123456,
      check_run_id: 555555,
      delta: 0.05,
    });

    await probot.receive({name: 'pull_request_review', payload});
  });

  test('ignore an approved review by an OWNERS for unknown PRs', async () => {
    const payload = getFixture('pull_request_review.submitted');

    await probot.receive({name: 'pull_request_review', payload});
  });

  test('mark a check "skipped"', async () => {
    await db('checks').insert({
      head_sha: '26ddec3fbbd3c7bd94e05a701c8b8c3ea8826faa',
      owner: 'ampproject',
      repo: 'amphtml',
      pull_request_id: 19603,
      installation_id: 123456,
      check_run_id: 555555,
      delta: null,
    });

    const nocks = nock('https://api.github.com')
        .patch('/repos/ampproject/amphtml/check-runs/555555', body => {
          expect(body).toMatchObject({
            conclusion: 'neutral',
            output: {
              title: 'check skipped because PR contains no runtime changes',
            },
          });
          return true;
        })
        .reply(200);

    await request(probot.server)
        .post('/v0/commit/26ddec3fbbd3c7bd94e05a701c8b8c3ea8826faa/skip')
        .expect(200);
    await waitUntilNockScopeIsDone(nocks);
  });

  test('ignore marking a check "skipped" for a missing head SHA', async () => {
    await request(probot.server)
        .post('/v0/commit/26ddec3fbbd3c7bd94e05a701c8b8c3ea8826faa/skip')
        .expect(404);
  });

  test.each([
    ['12.44KB', 'Δ -0.10KB 🎉 | no approval necessary'],
    ['12.34KB', 'Δ +0.00KB | no approval necessary'],
    ['12.24KB', 'Δ +0.10KB | no approval necessary'],
  ])('update a check on bundle-size report (report/base = 12.34KB/%s)',
      async (baseSize, message) => {
        await db('checks').insert({
          head_sha: '26ddec3fbbd3c7bd94e05a701c8b8c3ea8826faa',
          owner: 'ampproject',
          repo: 'amphtml',
          pull_request_id: 19603,
          installation_id: 123456,
          check_run_id: 555555,
          delta: null,
        });

        const baseBundleSizeFixture = getFixture(
            '5f27002526a808c5c1ad5d0f1ab1cec471af0a33');
        baseBundleSizeFixture.content = Buffer.from(baseSize)
            .toString('base64');
        const nocks = nock('https://api.github.com')
            .get('/repos/ampproject/amphtml-build-artifacts/contents/' +
                'bundle-size/5f27002526a808c5c1ad5d0f1ab1cec471af0a33')
            .reply(200, baseBundleSizeFixture)
            .patch('/repos/ampproject/amphtml/check-runs/555555', body => {
              expect(body).toMatchObject({
                conclusion: 'success',
                output: {
                  title: message,
                },
              });
              return true;
            })
            .reply(200);

        await request(probot.server)
            .post('/v0/commit/26ddec3fbbd3c7bd94e05a701c8b8c3ea8826faa/report')
            .send({
              baseSha: '5f27002526a808c5c1ad5d0f1ab1cec471af0a33',
              bundleSize: 12.34,
            })
            .set('Content-Type', 'application/json')
            .set('Accept', 'application/json')
            .expect(200);
        await waitUntilNockScopeIsDone(nocks);
      });

  test('update a check on bundle-size report with no OWNERS reviewers ' +
       '(report/base = 12.34KB/12.00KB)', async () => {
    await db('checks').insert({
      head_sha: '26ddec3fbbd3c7bd94e05a701c8b8c3ea8826faa',
      owner: 'ampproject',
      repo: 'amphtml',
      pull_request_id: 19603,
      installation_id: 123456,
      check_run_id: 555555,
      delta: null,
    });

    const baseBundleSizeFixture = getFixture(
        '5f27002526a808c5c1ad5d0f1ab1cec471af0a33');
    baseBundleSizeFixture.content = Buffer.from('12.00KB')
        .toString('base64');
    const nocks = nock('https://api.github.com')
        .get('/repos/ampproject/amphtml-build-artifacts/contents/' +
            'bundle-size/5f27002526a808c5c1ad5d0f1ab1cec471af0a33')
        .reply(200, baseBundleSizeFixture)
        .patch('/repos/ampproject/amphtml/check-runs/555555', body => {
          expect(body).toMatchObject({
            conclusion: 'action_required',
            output: {
              title: 'Δ +0.34KB | approval required',
            },
          });
          return true;
        })
        .reply(200)
        .get('/repos/ampproject/amphtml/pulls/19603/requested_reviewers')
        .reply(200, getFixture('requested_reviewers'))
        .get('/repos/ampproject/amphtml/pulls/19603/reviews')
        .reply(200, getFixture('reviews'))
        .post('/repos/ampproject/amphtml/pulls/19603/requested_reviewers',
            body => {
              expect(body).toMatchObject({
                reviewers: [
                  expect.stringMatching(/aghassemi|choumx|danielrozenberg/),
                ],
              });
              return true;
            })
        .reply(200);

    await request(probot.server)
        .post('/v0/commit/26ddec3fbbd3c7bd94e05a701c8b8c3ea8826faa/report')
        .send({
          baseSha: '5f27002526a808c5c1ad5d0f1ab1cec471af0a33',
          bundleSize: 12.34,
        })
        .set('Content-Type', 'application/json')
        .set('Accept', 'application/json')
        .expect(200);
    await waitUntilNockScopeIsDone(nocks);
  });

  test('update a check on bundle-size report with an OWNERS requested ' +
       'reviewer (report/base = 12.34KB/12.00KB)', async () => {
    await db('checks').insert({
      head_sha: '26ddec3fbbd3c7bd94e05a701c8b8c3ea8826faa',
      owner: 'ampproject',
      repo: 'amphtml',
      pull_request_id: 19603,
      installation_id: 123456,
      check_run_id: 555555,
      delta: null,
    });

    const baseBundleSizeFixture = getFixture(
        '5f27002526a808c5c1ad5d0f1ab1cec471af0a33');
    baseBundleSizeFixture.content = Buffer.from('12.00KB')
        .toString('base64');
    const requestedReviewers = getFixture('requested_reviewers');
    requestedReviewers.users[0].login = 'choumx';
    const nocks = nock('https://api.github.com')
        .get('/repos/ampproject/amphtml-build-artifacts/contents/' +
            'bundle-size/5f27002526a808c5c1ad5d0f1ab1cec471af0a33')
        .reply(200, baseBundleSizeFixture)
        .patch('/repos/ampproject/amphtml/check-runs/555555', body => {
          expect(body).toMatchObject({
            conclusion: 'action_required',
            output: {
              title: 'Δ +0.34KB | approval required',
            },
          });
          return true;
        })
        .reply(200)
        .get('/repos/ampproject/amphtml/pulls/19603/requested_reviewers')
        .reply(200, requestedReviewers)
        .get('/repos/ampproject/amphtml/pulls/19603/reviews')
        .reply(200, getFixture('reviews'));

    await request(probot.server)
        .post('/v0/commit/26ddec3fbbd3c7bd94e05a701c8b8c3ea8826faa/report')
        .send({
          baseSha: '5f27002526a808c5c1ad5d0f1ab1cec471af0a33',
          bundleSize: 12.34,
        })
        .set('Content-Type', 'application/json')
        .set('Accept', 'application/json')
        .expect(200);
    await waitUntilNockScopeIsDone(nocks);
  });

  test('update a check on bundle-size report with an OWNERS existing ' +
       'reviewer (report/base = 12.34KB/12.00KB)', async () => {
    await db('checks').insert({
      head_sha: '26ddec3fbbd3c7bd94e05a701c8b8c3ea8826faa',
      owner: 'ampproject',
      repo: 'amphtml',
      pull_request_id: 19603,
      installation_id: 123456,
      check_run_id: 555555,
      delta: null,
    });

    const baseBundleSizeFixture = getFixture(
        '5f27002526a808c5c1ad5d0f1ab1cec471af0a33');
    baseBundleSizeFixture.content = Buffer.from('12.00KB')
        .toString('base64');
    const reviews = getFixture('reviews');
    reviews[0].user.login = 'choumx';
    const nocks = nock('https://api.github.com')
        .get('/repos/ampproject/amphtml-build-artifacts/contents/' +
            'bundle-size/5f27002526a808c5c1ad5d0f1ab1cec471af0a33')
        .reply(200, baseBundleSizeFixture)
        .patch('/repos/ampproject/amphtml/check-runs/555555', body => {
          expect(body).toMatchObject({
            conclusion: 'action_required',
            output: {
              title: 'Δ +0.34KB | approval required',
            },
          });
          return true;
        })
        .reply(200)
        .get('/repos/ampproject/amphtml/pulls/19603/requested_reviewers')
        .reply(200, getFixture('requested_reviewers'))
        .get('/repos/ampproject/amphtml/pulls/19603/reviews')
        .reply(200, reviews);

    await request(probot.server)
        .post('/v0/commit/26ddec3fbbd3c7bd94e05a701c8b8c3ea8826faa/report')
        .send({
          baseSha: '5f27002526a808c5c1ad5d0f1ab1cec471af0a33',
          bundleSize: 12.34,
        })
        .set('Content-Type', 'application/json')
        .set('Accept', 'application/json')
        .expect(200);
    await waitUntilNockScopeIsDone(nocks);
  });

  test('update check on bundle-size report (report/_delayed_-base = ' +
       '12.34KB/12.34KB)', async () => {
    await db('checks').insert({
      head_sha: '26ddec3fbbd3c7bd94e05a701c8b8c3ea8826faa',
      owner: 'ampproject',
      repo: 'amphtml',
      pull_request_id: 19603,
      installation_id: 123456,
      check_run_id: 555555,
      delta: null,
    });

    const baseBundleSizeFixture = getFixture(
        '5f27002526a808c5c1ad5d0f1ab1cec471af0a33');
    baseBundleSizeFixture.content = Buffer.from('12.34KB')
        .toString('base64');
    const nocks = nock('https://api.github.com')
        .get('/repos/ampproject/amphtml-build-artifacts/contents/' +
            'bundle-size/5f27002526a808c5c1ad5d0f1ab1cec471af0a33')
        .times(2)
        .reply(404)
        .get('/repos/ampproject/amphtml-build-artifacts/contents/' +
            'bundle-size/5f27002526a808c5c1ad5d0f1ab1cec471af0a33')
        .reply(200, baseBundleSizeFixture)
        .patch('/repos/ampproject/amphtml/check-runs/555555', body => {
          expect(body).toMatchObject({
            conclusion: 'success',
            output: {
              title: 'Δ +0.00KB | no approval necessary',
            },
          });
          return true;
        })
        .reply(200);

    await request(probot.server)
        .post('/v0/commit/26ddec3fbbd3c7bd94e05a701c8b8c3ea8826faa/report')
        .send({
          baseSha: '5f27002526a808c5c1ad5d0f1ab1cec471af0a33',
          bundleSize: 12.34,
        })
        .set('Content-Type', 'application/json')
        .set('Accept', 'application/json')
        .expect(202);
    await waitUntilNockScopeIsDone(nocks);
  });

  test('update check on bundle-size report (report/_delayed_-base = ' +
       '12.34KB/12.23KB)', async () => {
    await db('checks').insert({
      head_sha: '26ddec3fbbd3c7bd94e05a701c8b8c3ea8826faa',
      owner: 'ampproject',
      repo: 'amphtml',
      pull_request_id: 19603,
      installation_id: 123456,
      check_run_id: 555555,
      delta: null,
    });

    const baseBundleSizeFixture = getFixture(
        '5f27002526a808c5c1ad5d0f1ab1cec471af0a33');
    baseBundleSizeFixture.content = Buffer.from('12.23KB')
        .toString('base64');
    const nocks = nock('https://api.github.com')
        .get('/repos/ampproject/amphtml-build-artifacts/contents/' +
            'bundle-size/5f27002526a808c5c1ad5d0f1ab1cec471af0a33')
        .times(2)
        .reply(404)
        .get('/repos/ampproject/amphtml-build-artifacts/contents/' +
            'bundle-size/5f27002526a808c5c1ad5d0f1ab1cec471af0a33')
        .reply(200, baseBundleSizeFixture)
        .patch('/repos/ampproject/amphtml/check-runs/555555', body => {
          expect(body).toMatchObject({
            conclusion: 'action_required',
            output: {
              title: 'Δ +0.11KB | approval required',
            },
          });
          return true;
        })
        .reply(200)
        .get('/repos/ampproject/amphtml/pulls/19603/requested_reviewers')
        .reply(200, getFixture('requested_reviewers'))
        .get('/repos/ampproject/amphtml/pulls/19603/reviews')
        .reply(200, getFixture('reviews'))
        .post('/repos/ampproject/amphtml/pulls/19603/requested_reviewers',
            body => {
              expect(body).toMatchObject({
                reviewers: [
                  expect.stringMatching(/aghassemi|choumx|danielrozenberg/),
                ],
              });
              return true;
            })
        .reply(200);

    await request(probot.server)
        .post('/v0/commit/26ddec3fbbd3c7bd94e05a701c8b8c3ea8826faa/report')
        .send({
          baseSha: '5f27002526a808c5c1ad5d0f1ab1cec471af0a33',
          bundleSize: 12.34,
        })
        .set('Content-Type', 'application/json')
        .set('Accept', 'application/json')
        .expect(202);
    await waitUntilNockScopeIsDone(nocks);
  });

  test('update check on bundle-size report on missing base size', async () => {
    await db('checks').insert({
      head_sha: '26ddec3fbbd3c7bd94e05a701c8b8c3ea8826faa',
      owner: 'ampproject',
      repo: 'amphtml',
      pull_request_id: 19603,
      installation_id: 123456,
      check_run_id: 555555,
      delta: null,
    });

    const nocks = nock('https://api.github.com')
        .get('/repos/ampproject/amphtml-build-artifacts/contents/' +
            'bundle-size/5f27002526a808c5c1ad5d0f1ab1cec471af0a33')
        .times(60)
        .reply(404)
        .patch('/repos/ampproject/amphtml/check-runs/555555', body => {
          expect(body).toMatchObject({
            conclusion: 'action_required',
            output: {
              title:
                  'Failed to retrieve the bundle size of branch point 5f27002',
            },
          });
          return true;
        })
        .reply(200)
        .get('/repos/ampproject/amphtml/pulls/19603/requested_reviewers')
        .reply(200, getFixture('requested_reviewers'))
        .get('/repos/ampproject/amphtml/pulls/19603/reviews')
        .reply(200, getFixture('reviews'))
        .post('/repos/ampproject/amphtml/pulls/19603/requested_reviewers',
            body => {
              expect(body).toMatchObject({
                reviewers: [
                  expect.stringMatching(/aghassemi|choumx|danielrozenberg/),
                ],
              });
              return true;
            })
        .reply(200);

    await request(probot.server)
        .post('/v0/commit/26ddec3fbbd3c7bd94e05a701c8b8c3ea8826faa/report')
        .send({
          baseSha: '5f27002526a808c5c1ad5d0f1ab1cec471af0a33',
          bundleSize: 12.34,
        })
        .set('Content-Type', 'application/json')
        .set('Accept', 'application/json')
        .expect(202);
    await waitUntilNockScopeIsDone(nocks);
  });

  test('ignore bundle-size report for a missing head SHA', async () => {
    await request(probot.server)
        .post('/v0/commit/26ddec3fbbd3c7bd94e05a701c8b8c3ea8826faa/report')
        .send({
          baseSha: '5f27002526a808c5c1ad5d0f1ab1cec471af0a33',
          bundleSize: 12.34,
        })
        .set('Content-Type', 'application/json')
        .set('Accept', 'application/json')
        .expect(404);
  });

  test.each([
    {},
    {aFieldThatIsNotBundleSize: 12.34},
    {baseSha: '5f27002526a808c5c1ad5d0f1ab1cec471af0a33', bundleSize: '12.34'},
    {baseSha: '5f27002', bundleSize: 12.34},
    {baseSha: '5f27002526a808c5c1ad5d0f1ab1cec471af0a33'},
    {bundleSize: 12.34},
  ])('ignore bundle-size report with incorrect input: %p', async data => {
    await request(probot.server)
        .post('/v0/commit/26ddec3fbbd3c7bd94e05a701c8b8c3ea8826faa/report')
        .send(data)
        .set('Content-Type', 'application/json')
        .set('Accept', 'application/json')
        .expect(400);
  });

  test('ignore closed (not merged) pull request', async () => {
    const pullRequestPayload = getFixture('pull_request.opened');
    pullRequestPayload.action = 'closed';

    await probot.receive({name: 'pull_request', payload: pullRequestPayload});
    expect(await db('merges').select('*')).toMatchObject([]);

    const checkRunPayload = getFixture('check_run.created');

    await probot.receive({name: 'check_run', payload: checkRunPayload});
  });

  test('skip the check on a merged pull request', async () => {
    const pullRequestPayload = getFixture('pull_request.opened');
    pullRequestPayload.action = 'closed';
    pullRequestPayload.pull_request.merged_at = '2019-02-25T20:21:58Z';
    pullRequestPayload.pull_request.merge_commit_sha =
        '4ba02c691d1a3014f70a7521c07d775dc6a1e355';

    await probot.receive({name: 'pull_request', payload: pullRequestPayload});
    expect(await db('merges').select('*')).toMatchObject([
      {merge_commit_sha: '4ba02c691d1a3014f70a7521c07d775dc6a1e355'},
    ]);

    const checkRunPayload = getFixture('check_run.created');

    const nocks = nock('https://api.github.com')
        .patch('/repos/ampproject/amphtml/check-runs/68609861', body => {
          expect(body).toMatchObject({
            conclusion: 'neutral',
            output: {
              title: 'Check skipped because this is a merged commit',
            },
          });
          return true;
        })
        .reply(200);

    await probot.receive({name: 'check_run', payload: checkRunPayload});
    expect(await db('merges').select('*')).toMatchObject([]);
    await waitUntilNockScopeIsDone(nocks);
  });

  test('fail when a pull request is reported as merged twice', async () => {
    const pullRequestPayload = getFixture('pull_request.opened');
    pullRequestPayload.action = 'closed';
    pullRequestPayload.pull_request.merged_at = '2019-02-25T20:21:58Z';
    pullRequestPayload.pull_request.merge_commit_sha =
        '4ba02c691d1a3014f70a7521c07d775dc6a1e355';

    await probot.receive({name: 'pull_request', payload: pullRequestPayload});
    try {
      await probot.receive({name: 'pull_request', payload: pullRequestPayload});
    } catch (e) {
      expect(e.message).toContain('UNIQUE constraint failed');
    }
  });

  test('reject non-Travis IP addresses', async () => {
    process.env['TRAVIS_IP_ADDRESSES'] = '999.999.999.999,123.456.789.012';
    await request(probot.server)
        .post('/v0/commit/26ddec3fbbd3c7bd94e05a701c8b8c3ea8826faa/skip')
        .expect(403, 'You are not Travis!');
  });
});
