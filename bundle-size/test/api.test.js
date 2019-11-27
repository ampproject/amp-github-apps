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

const {dbConnect} = require('../db');
const {getFixture} = require('./_test_helper');
const {GitHubUtils} = require('../github-utils');
const {installApiRouter} = require('../api');
const nock = require('nock');
const NodeCache = require('node-cache');
const Octokit = require('@octokit/rest');
const {Probot} = require('probot');
const request = require('supertest');
const {setupDb} = require('../setup-db');

nock.disableNetConnect();
nock.enableNetConnect('127.0.0.1');
jest.mock('../db');
jest.mock('sleep-promise', () => () => Promise.resolve());
jest.setTimeout(30000);

describe('bundle-size api', () => {
  let probot;
  let app;
  const db = dbConnect();
  const nodeCache = new NodeCache();

  beforeAll(async () => {
    await setupDb(db);

    probot = new Probot({});
    app = probot.load(app => {
      const github = new Octokit();
      const githubUtils = new GitHubUtils(github, app.log, nodeCache);
      installApiRouter(app, db, github, githubUtils);
    });

    // Return a test token.
    app.app = {
      getInstallationAccessToken: () => Promise.resolve('test'),
    };
  });

  beforeEach(async () => {
    nodeCache.flushAll();

    process.env = {
      TRAVIS_PUSH_BUILD_TOKEN: '0123456789abcdefghijklmnopqrstuvwxyz',
      MAX_ALLOWED_INCREASE: '0.1',
      APPROVER_TEAMS: '123,234',
      REVIEWER_TEAMS: '123',
    };

    nock('https://api.github.com')
      .post('/app/installations/123456/access_tokens')
      .reply(200, {token: 'test'});

    nock('https://api.github.com')
      .persist()
      .get('/teams/123/memberships/aghassemi')
      .reply(404)
      .get('/teams/234/memberships/aghassemi')
      .reply(200)
      .get(/teams\/\d+\/memberships\/\w+$/)
      .reply(404)
      .get('/teams/123/members')
      .reply(200, getFixture('teams.123.members'))
      .get('/teams/234/members')
      .reply(200, getFixture('teams.234.members'))
      .get(
        '/repos/ampproject/amphtml/contents/build-system/tasks/bundle-size/APPROVERS.json'
      )
      .reply(200, getFixture('APPROVERS.json'))
      .get(/\/orgs\/ampproject\/teams\/wg-\w+/)
      .reply(200, getFixture('teams.getByName.wg-runtime'))
      .get('/teams/3065818/members')
      .reply(200, getFixture('teams.listMembers.3065818'));
  });

  afterEach(async () => {
    nock.cleanAll();
    await db('checks').truncate();
  });

  afterAll(async () => {
    await db.destroy();
  });

  describe('/commit/:headSha/skip', () => {
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
      nocks.done();
    });

    test('ignore marking a check "skipped" for a missing head SHA', async () => {
      await request(probot.server)
        .post('/v0/commit/26ddec3fbbd3c7bd94e05a701c8b8c3ea8826faa/skip')
        .expect(404);
    });
  });

  describe('/commit/:headSha/report', () => {
    let jsonPayload;

    beforeEach(() => {
      jsonPayload = {
        baseSha: '5f27002526a808c5c1ad5d0f1ab1cec471af0a33',
        bundleSizes: {
          'dist/v0.js': 12.34,
          'dist/amp4ads-v0.js': 11.22,
          'dist/v0/amp-accordion-0.1.js': 1.11,
          'dist/v0/amp-ad-0.1.js': 4.56,
        },
      };
    });

    test.each([
      [12.44, 'Δ -0.10KB | no approval necessary'],
      [12.34, 'Δ +0.00KB | no approval necessary'],
      [12.24, 'Δ +0.10KB | no approval necessary'],
    ])(
      'update a check on bundle-size report (report/base = 12.34KB/%dKB)',
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
          '5f27002526a808c5c1ad5d0f1ab1cec471af0a33.json'
        );
        baseBundleSizeFixture.content = Buffer.from(
          `{"dist/v0.js":${baseSize}}`
        ).toString('base64');
        const nocks = nock('https://api.github.com')
          .get(
            '/repos/ampproject/amphtml-build-artifacts/contents/' +
              'bundle-size/5f27002526a808c5c1ad5d0f1ab1cec471af0a33.json'
          )
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
          .send(jsonPayload)
          .set('Content-Type', 'application/json')
          .set('Accept', 'application/json')
          .expect(200);
        nocks.done();
      }
    );

    test('update a check with multiple files on bundle-size report', async () => {
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
        '5f27002526a808c5c1ad5d0f1ab1cec471af0a33.json'
      );
      baseBundleSizeFixture.content = Buffer.from(
        '{"dist/v0.js":12.34,"dist/v0/amp-accordion-0.1.js":1.11,"dist/v0/amp-ad-0.1.js":4.53,"dist/v0/amp-anim-0.1.js":5.65}'
      ).toString('base64');
      const nocks = nock('https://api.github.com')
        .get(
          '/repos/ampproject/amphtml-build-artifacts/contents/' +
            'bundle-size/5f27002526a808c5c1ad5d0f1ab1cec471af0a33.json'
        )
        .reply(200, baseBundleSizeFixture)
        .patch('/repos/ampproject/amphtml/check-runs/555555', body => {
          expect(body).toMatchObject({
            conclusion: 'success',
            output: {
              title: 'Δ +0.00KB | no approval necessary',
              summary: expect.stringContaining(
                '* `dist/v0/amp-ad-0.1.js`: Δ +0.03KB\n' +
                  '* `dist/v0/amp-anim-0.1.js`: missing in pull request\n' +
                  '* `dist/amp4ads-v0.js`: (11.22 KB) missing in `master`'
              ),
            },
          });
          return true;
        })
        .reply(200);

      await request(probot.server)
        .post('/v0/commit/26ddec3fbbd3c7bd94e05a701c8b8c3ea8826faa/report')
        .send(jsonPayload)
        .set('Content-Type', 'application/json')
        .set('Accept', 'application/json')
        .expect(200);
      nocks.done();
    });

    test(
      'update a check on bundle-size report with no capable reviewers ' +
        '(report/base = 12.34KB/12.00KB)',
      async () => {
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
          '5f27002526a808c5c1ad5d0f1ab1cec471af0a33.json'
        );
        baseBundleSizeFixture.content = Buffer.from(
          '{"dist/v0.js":12}'
        ).toString('base64');
        const nocks = nock('https://api.github.com')
          .get(
            '/repos/ampproject/amphtml-build-artifacts/contents/' +
              'bundle-size/5f27002526a808c5c1ad5d0f1ab1cec471af0a33.json'
          )
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
          .post(
            '/repos/ampproject/amphtml/pulls/19603/requested_reviewers',
            body => {
              expect(body).toMatchObject({
                reviewers: [expect.stringMatching(/erwinmombay|estherkim/)],
              });
              return true;
            }
          )
          .reply(200);

        await request(probot.server)
          .post('/v0/commit/26ddec3fbbd3c7bd94e05a701c8b8c3ea8826faa/report')
          .send(jsonPayload)
          .set('Content-Type', 'application/json')
          .set('Accept', 'application/json')
          .expect(200);
        nocks.done();
      }
    );

    test(
      'update a check on bundle-size report with a capable reviewer ' +
        '(report/base = 12.34KB/12.00KB)',
      async () => {
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
          '5f27002526a808c5c1ad5d0f1ab1cec471af0a33.json'
        );
        baseBundleSizeFixture.content = Buffer.from(
          '{"dist/v0.js":12}'
        ).toString('base64');
        const nocks = nock('https://api.github.com')
          .get(
            '/repos/ampproject/amphtml-build-artifacts/contents/' +
              'bundle-size/5f27002526a808c5c1ad5d0f1ab1cec471af0a33.json'
          )
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
          .post(
            '/repos/ampproject/amphtml/pulls/19603/requested_reviewers',
            body => {
              expect(body).toMatchObject({
                reviewers: [expect.stringMatching(/erwinmombay|estherkim/)],
              });
              return true;
            }
          )
          .reply(200);

        await request(probot.server)
          .post('/v0/commit/26ddec3fbbd3c7bd94e05a701c8b8c3ea8826faa/report')
          .send(jsonPayload)
          .set('Content-Type', 'application/json')
          .set('Accept', 'application/json')
          .expect(200);
        nocks.done();
      }
    );

    test(
      'update a check on bundle-size report with an existing capable ' +
        'reviewer (report/base = 12.34KB/12.00KB)',
      async () => {
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
          '5f27002526a808c5c1ad5d0f1ab1cec471af0a33.json'
        );
        baseBundleSizeFixture.content = Buffer.from(
          '{"dist/v0.js":12}'
        ).toString('base64');
        const reviews = getFixture('reviews');
        reviews[0].user.login = 'aghassemi';
        const nocks = nock('https://api.github.com')
          .get(
            '/repos/ampproject/amphtml-build-artifacts/contents/' +
              'bundle-size/5f27002526a808c5c1ad5d0f1ab1cec471af0a33.json'
          )
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
          .send(jsonPayload)
          .set('Content-Type', 'application/json')
          .set('Accept', 'application/json')
          .expect(200);
        nocks.done();
      }
    );

    test(
      'update check on bundle-size report (report/_delayed_-base = ' +
        '12.34KB/12.34KB)',
      async () => {
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
          '5f27002526a808c5c1ad5d0f1ab1cec471af0a33.json'
        );
        baseBundleSizeFixture.content = Buffer.from(
          '{"dist/v0.js":12.34}'
        ).toString('base64');
        const lastNetworkRequest = new Promise(resolve => {
          const nocks = nock('https://api.github.com')
            .get(
              '/repos/ampproject/amphtml-build-artifacts/contents/' +
                'bundle-size/5f27002526a808c5c1ad5d0f1ab1cec471af0a33.json'
            )
            .times(2)
            .reply(404)
            .get(
              '/repos/ampproject/amphtml-build-artifacts/contents/' +
                'bundle-size/5f27002526a808c5c1ad5d0f1ab1cec471af0a33.json'
            )
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
            .reply(200, () => {
              setTimeout(() => {
                resolve(nocks);
              }, 0);
            });
        });

        await request(probot.server)
          .post('/v0/commit/26ddec3fbbd3c7bd94e05a701c8b8c3ea8826faa/report')
          .send(jsonPayload)
          .set('Content-Type', 'application/json')
          .set('Accept', 'application/json')
          .expect(202);
        const nocks = await lastNetworkRequest;
        nocks.done();
      }
    );

    test(
      'update check on bundle-size report (report/_delayed_-base = ' +
        '12.34KB/12.23KB)',
      async () => {
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
          '5f27002526a808c5c1ad5d0f1ab1cec471af0a33.json'
        );
        baseBundleSizeFixture.content = Buffer.from(
          '{"dist/v0.js":12.23}'
        ).toString('base64');
        const lastNetworkRequest = new Promise(resolve => {
          const nocks = nock('https://api.github.com')
            .get(
              '/repos/ampproject/amphtml-build-artifacts/contents/' +
                'bundle-size/5f27002526a808c5c1ad5d0f1ab1cec471af0a33.json'
            )
            .times(2)
            .reply(404)
            .get(
              '/repos/ampproject/amphtml-build-artifacts/contents/' +
                'bundle-size/5f27002526a808c5c1ad5d0f1ab1cec471af0a33.json'
            )
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
            .post(
              '/repos/ampproject/amphtml/pulls/19603/requested_reviewers',
              body => {
                expect(body).toMatchObject({
                  reviewers: [expect.stringMatching(/erwinmombay|estherkim/)],
                });
                return true;
              }
            )
            .reply(200, () => {
              setTimeout(() => {
                resolve(nocks);
              }, 0);
            });
        });

        await request(probot.server)
          .post('/v0/commit/26ddec3fbbd3c7bd94e05a701c8b8c3ea8826faa/report')
          .send(jsonPayload)
          .set('Content-Type', 'application/json')
          .set('Accept', 'application/json')
          .expect(202);
        const nocks = await lastNetworkRequest;
        nocks.done();
      }
    );

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

      const lastNetworkRequest = new Promise(resolve => {
        const nocks = nock('https://api.github.com')
          .get(
            '/repos/ampproject/amphtml-build-artifacts/contents/' +
              'bundle-size/5f27002526a808c5c1ad5d0f1ab1cec471af0a33.json'
          )
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
          .post(
            '/repos/ampproject/amphtml/pulls/19603/requested_reviewers',
            body => {
              expect(body).toMatchObject({
                reviewers: [expect.stringMatching(/erwinmombay|estherkim/)],
              });
              return true;
            }
          )
          .reply(200, () => {
            setTimeout(() => {
              resolve(nocks);
            }, 0);
          });
      });

      await request(probot.server)
        .post('/v0/commit/26ddec3fbbd3c7bd94e05a701c8b8c3ea8826faa/report')
        .send(jsonPayload)
        .set('Content-Type', 'application/json')
        .set('Accept', 'application/json')
        .expect(202);
      const nocks = await lastNetworkRequest;
      nocks.done();
    });

    test('ignore bundle-size report for a missing head SHA', async () => {
      await request(probot.server)
        .post('/v0/commit/26ddec3fbbd3c7bd94e05a701c8b8c3ea8826faa/report')
        .send(jsonPayload)
        .set('Content-Type', 'application/json')
        .set('Accept', 'application/json')
        .expect(404);
    });

    test.each([
      {
        // Missing everything.
      },
      {
        // Missing bundleSizes field.
        baseSha: '5f27002526a808c5c1ad5d0f1ab1cec471af0a33',
        bundleSize: 12.34,
      },
      {
        // Missing 'dist/v0.js' key.
        baseSha: '5f27002526a808c5c1ad5d0f1ab1cec471af0a33',
        bundleSizes: {
          'dist/amp4ads-v0.js': 12.34,
        },
      },
      {
        // bashSha is a partial SHA, not a complete SHA.
        baseSha: '5f27002',
        bundleSizes: {
          'dist/v0.js': 12.34,
        },
      },
      {
        // A bundle size is reporter as a string, not a number.
        baseSha: '5f27002526a808c5c1ad5d0f1ab1cec471af0a33',
        bundleSizes: {
          'dist/v0.js': 12.34,
          'dist/amp4ads-v0.js': '11.22',
        },
      },
      {
        // Missing baseSha field.
        bundleSizes: {
          'dist/v0.js': 12.34,
        },
      },
    ])('ignore bundle-size report with incorrect input: %p', async data => {
      await request(probot.server)
        .post('/v0/commit/26ddec3fbbd3c7bd94e05a701c8b8c3ea8826faa/report')
        .send(data)
        .set('Content-Type', 'application/json')
        .set('Accept', 'application/json')
        .expect(400);
    });
  });

  describe('/commit/:headSha/store', () => {
    let jsonPayload;

    beforeEach(() => {
      jsonPayload = {
        token: '0123456789abcdefghijklmnopqrstuvwxyz',
        bundleSizes: {
          'dist/v0.js': 12.34,
          'dist/amp4ads-v0.js': 11.22,
        },
      };
    });

    test('store new bundle-size', async () => {
      const nocks = nock('https://api.github.com')
        .get(
          '/repos/ampproject/amphtml-build-artifacts/contents/' +
            'bundle-size/5f27002526a808c5c1ad5d0f1ab1cec471af0a33.json'
        )
        .reply(404)
        .put(
          '/repos/ampproject/amphtml-build-artifacts/contents/' +
            'bundle-size/5f27002526a808c5c1ad5d0f1ab1cec471af0a33.json',
          {
            message:
              'bundle-size: 5f27002526a808c5c1ad5d0f1ab1cec471af0a33.json',
            content: Buffer.from(
              JSON.stringify(jsonPayload.bundleSizes)
            ).toString('base64'),
          }
        )
        .reply(201);

      await request(probot.server)
        .post('/v0/commit/5f27002526a808c5c1ad5d0f1ab1cec471af0a33/store')
        .send(jsonPayload)
        .set('Content-Type', 'application/json')
        .set('Accept', 'application/json')
        .expect(200);
      nocks.done();
    });

    test('ignore already existing bundle-size when called to store', async () => {
      const nocks = nock('https://api.github.com')
        .get(
          '/repos/ampproject/amphtml-build-artifacts/contents/' +
            'bundle-size/5f27002526a808c5c1ad5d0f1ab1cec471af0a33.json'
        )
        .reply(
          200,
          getFixture('5f27002526a808c5c1ad5d0f1ab1cec471af0a33.json')
        );

      await request(probot.server)
        .post('/v0/commit/5f27002526a808c5c1ad5d0f1ab1cec471af0a33/store')
        .send(jsonPayload)
        .set('Content-Type', 'application/json')
        .set('Accept', 'application/json')
        .expect(200);
      nocks.done();
    });

    test('show error when failed to store bundle-size', async () => {
      const nocks = nock('https://api.github.com')
        .get(
          '/repos/ampproject/amphtml-build-artifacts/contents/' +
            'bundle-size/5f27002526a808c5c1ad5d0f1ab1cec471af0a33.json'
        )
        .reply(404)
        .put(
          '/repos/ampproject/amphtml-build-artifacts/contents/' +
            'bundle-size/5f27002526a808c5c1ad5d0f1ab1cec471af0a33.json',
          {
            message:
              'bundle-size: 5f27002526a808c5c1ad5d0f1ab1cec471af0a33.json',
            content: Buffer.from(
              JSON.stringify(jsonPayload.bundleSizes)
            ).toString('base64'),
          }
        )
        .reply(418, 'I am a tea pot');

      await request(probot.server)
        .post('/v0/commit/5f27002526a808c5c1ad5d0f1ab1cec471af0a33/store')
        .send(jsonPayload)
        .set('Content-Type', 'application/json')
        .set('Accept', 'application/json')
        .expect(500, /I am a tea pot/);
      nocks.done();
    });

    test('fail on non-numeric values when called to store bundle-size', async () => {
      jsonPayload.bundleSizes['dist/shadow-v0.js'] = '23.45KB';

      await request(probot.server)
        .post('/v0/commit/5f27002526a808c5c1ad5d0f1ab1cec471af0a33/store')
        .send(jsonPayload)
        .set('Content-Type', 'application/json')
        .set('Accept', 'application/json')
        .expect(
          400,
          'POST request to /store must have a key/value object Map<string, number> field "bundleSizes"'
        );
    });

    test('fail on missing values when called to store bundle-size', async () => {
      delete jsonPayload.bundleSizes;

      await request(probot.server)
        .post('/v0/commit/5f27002526a808c5c1ad5d0f1ab1cec471af0a33/store')
        .send(jsonPayload)
        .set('Content-Type', 'application/json')
        .set('Accept', 'application/json')
        .expect(
          400,
          'POST request to /store must have a key/value object Map<string, number> field "bundleSizes"'
        );
    });

    test('rejects calls to store without the Travis token', async () => {
      jsonPayload.token = 'wrong token';

      await request(probot.server)
        .post('/v0/commit/5f27002526a808c5c1ad5d0f1ab1cec471af0a33/store')
        .send(jsonPayload)
        .set('Content-Type', 'application/json')
        .set('Accept', 'application/json')
        .expect(403, 'You are not Travis!');
    });
  });

  test('reject non-Travis IP addresses', async () => {
    process.env['TRAVIS_IP_ADDRESSES'] = '999.999.999.999,123.456.789.012';
    await request(probot.server)
      .post('/v0/commit/26ddec3fbbd3c7bd94e05a701c8b8c3ea8826faa/skip')
      .expect(403, 'You are not Travis!');
  });
});
