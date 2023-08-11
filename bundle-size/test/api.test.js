/**
 * Copyright 2018 The AMP HTML Authors. All Rights Reserved.
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
const NodeCache = require('node-cache');
const request = require('supertest');
const {dbConnect} = require('../db');
const {getFixture} = require('./_test_helper');
const {GitHubUtils} = require('../github-utils');
const {installApiRouter} = require('../api');
const {Probot, Server, ProbotOctokit} = require('probot');
const {setupDb} = require('../setup-db');

nock.disableNetConnect();
nock.enableNetConnect('127.0.0.1');
jest.mock('../db');
jest.mock('sleep-promise', () => () => Promise.resolve());

describe('bundle-size api', () => {
  let github;
  let server;
  const db = dbConnect();
  const nodeCache = new NodeCache();
  let logWarnSpy;
  let logErrorSpy;

  beforeAll(async () => {
    await setupDb(db);
  });

  beforeEach(() => {
    github = {
      checks: {
        update: jest.fn(),
      },
      pulls: {
        get: jest.fn(),
        listRequestedReviewers: jest
          .fn()
          .mockResolvedValue({data: getFixture('requested_reviewers')}),
        listReviews: jest.fn().mockResolvedValue({data: getFixture('reviews')}),
        requestReviewers: jest.fn(),
      },
      repos: {
        createOrUpdateFileContents: jest.fn(),
        getContent: jest.fn().mockImplementation(params => {
          const fixture = params.path.replace(/^.+\/(.+)$/, '$1');
          return Promise.resolve({data: getFixture(fixture)});
        }),
      },
      teams: {
        listMembersInOrg: jest.fn().mockImplementation(params => {
          const fixture = `teams.listMembersInOrg.${params.team_slug}`;
          return Promise.resolve({data: getFixture(fixture)});
        }),
      },
    };

    server = new Server({
      Probot: Probot.defaults({
        githubToken: 'test',
        // Disable throttling & retrying requests for easier testing
        Octokit: ProbotOctokit.defaults({
          retry: {enabled: false},
          throttle: {enabled: false},
        }),
      }),
    });
    server.load((app, {getRouter}) => {
      const githubUtils = new GitHubUtils(github, app.log, nodeCache);
      installApiRouter(app, getRouter('/v0'), db, githubUtils);

      app.auth = () => github;
      // Stub app.log.warn/error to silence test log noise.
      logWarnSpy = jest.spyOn(app.log, 'warn').mockImplementation();
      logErrorSpy = jest.spyOn(app.log, 'error').mockImplementation();
    });

    nodeCache.flushAll();

    process.env = {
      CI_PUSH_BUILD_TOKEN: '0123456789abcdefghijklmnopqrstuvwxyz',
      FALLBACK_APPROVER_TEAMS:
        'ampproject/wg-runtime,ampproject/wg-performance',
      SUPER_USER_TEAMS: 'ampproject/wg-infra',
    };
  });

  afterEach(async () => {
    logWarnSpy.mockRestore();
    logErrorSpy.mockRestore();
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
        approving_teams: null,
        report_markdown: null,
      });

      await request(server.expressApp)
        .post('/v0/commit/26ddec3fbbd3c7bd94e05a701c8b8c3ea8826faa/skip')
        .expect(200);

      await expect(
        db('checks')
          .where({
            head_sha: '26ddec3fbbd3c7bd94e05a701c8b8c3ea8826faa',
          })
          .first()
      ).resolves.toMatchObject({
        head_sha: '26ddec3fbbd3c7bd94e05a701c8b8c3ea8826faa',
        owner: 'ampproject',
        repo: 'amphtml',
        pull_request_id: 19603,
        installation_id: 123456,
        check_run_id: 555555,
        approving_teams: null,
        report_markdown: null,
      });

      expect(github.checks.update).toHaveBeenCalledWith(
        expect.objectContaining({
          check_run_id: 555555,
          conclusion: 'neutral',
          output: expect.objectContaining({
            title: 'Check skipped because PR contains no runtime changes',
          }),
        })
      );
    });

    test('ignore marking a check "skipped" for a missing head SHA', async () => {
      await request(server.expressApp)
        .post('/v0/commit/26ddec3fbbd3c7bd94e05a701c8b8c3ea8826faa/skip')
        .expect(404);

      expect(github.checks.update).not.toHaveBeenCalled();
    });
  });

  describe('/commit/:headSha/report', () => {
    let jsonPayload;
    let pullRequestFixture;
    let baseBundleSizeFixture;

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

      pullRequestFixture = getFixture('pulls.get.19603');
      github.pulls.get.mockResolvedValue({data: pullRequestFixture});

      baseBundleSizeFixture = getFixture(
        '5f27002526a808c5c1ad5d0f1ab1cec471af0a33.json'
      );
      github.repos.getContent.mockImplementation(params => {
        if (
          params.path.endsWith('5f27002526a808c5c1ad5d0f1ab1cec471af0a33.json')
        ) {
          return Promise.resolve({data: baseBundleSizeFixture});
        }
        const fixture = params.path.replace(/^.+\/(.+)$/, '$1');
        return Promise.resolve({data: getFixture(fixture)});
      });
    });

    test.each([
      [12.44, 'No approval necessary'],
      [12.34, 'No approval necessary'],
      [12.24, 'No approval necessary'],
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
          approving_teams: null,
          report_markdown: null,
        });

        baseBundleSizeFixture.content = Buffer.from(
          `{"dist/v0.js":${baseSize}}`
        ).toString('base64');

        await request(server.expressApp)
          .post('/v0/commit/26ddec3fbbd3c7bd94e05a701c8b8c3ea8826faa/report')
          .send(jsonPayload)
          .set('Content-Type', 'application/json')
          .set('Accept', 'application/json')
          .expect(200);

        await expect(
          db('checks')
            .where({
              head_sha: '26ddec3fbbd3c7bd94e05a701c8b8c3ea8826faa',
            })
            .first()
        ).resolves.toMatchObject({
          head_sha: '26ddec3fbbd3c7bd94e05a701c8b8c3ea8826faa',
          owner: 'ampproject',
          repo: 'amphtml',
          pull_request_id: 19603,
          installation_id: 123456,
          check_run_id: 555555,
          approving_teams: null,
          report_markdown: null,
        });

        expect(github.checks.update).toHaveBeenCalledWith(
          expect.objectContaining({
            check_run_id: 555555,
            conclusion: 'success',
            output: expect.objectContaining({
              title: message,
            }),
          })
        );
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
        approving_teams: null,
        report_markdown: null,
      });

      baseBundleSizeFixture.content = Buffer.from(
        '{"dist/v0.js": 12.34,"dist/v0/amp-accordion-0.1.js":1.11,"dist/v0/amp-ad-0.1.js": 4.53,"dist/v0/amp-anim-0.1.js": 5.65}'
      ).toString('base64');

      await request(server.expressApp)
        .post('/v0/commit/26ddec3fbbd3c7bd94e05a701c8b8c3ea8826faa/report')
        .send(jsonPayload)
        .set('Content-Type', 'application/json')
        .set('Accept', 'application/json')
        .expect(200);

      await expect(
        db('checks')
          .where({
            head_sha: '26ddec3fbbd3c7bd94e05a701c8b8c3ea8826faa',
          })
          .first()
      ).resolves.toMatchObject({
        head_sha: '26ddec3fbbd3c7bd94e05a701c8b8c3ea8826faa',
        owner: 'ampproject',
        repo: 'amphtml',
        pull_request_id: 19603,
        installation_id: 123456,
        check_run_id: 555555,
        approving_teams: null,
        report_markdown: null,
      });

      expect(github.checks.update).toHaveBeenCalledWith(
        expect.objectContaining({
          check_run_id: 555555,
          conclusion: 'success',
          output: expect.objectContaining({
            title: 'No approval necessary',
            summary: expect.stringContaining(
              '## Auto-approved bundle size changes\n' +
                '* `dist/v0/amp-ad-0.1.js`: Δ +0.03KB\n' +
                '## Bundle sizes missing from this PR\n' +
                '* `dist/v0/amp-anim-0.1.js`: missing in pull request\n' +
                '* `dist/amp4ads-v0.js`: (11.22 KB) missing on the main branch'
            ),
          }),
        })
      );
    });

    test('sort files by bundle size delta in check update', async () => {
      await db('checks').insert({
        head_sha: '26ddec3fbbd3c7bd94e05a701c8b8c3ea8826faa',
        owner: 'ampproject',
        repo: 'amphtml',
        pull_request_id: 19603,
        installation_id: 123456,
        check_run_id: 555555,
        approving_teams: null,
        report_markdown: null,
      });

      jsonPayload = {
        baseSha: '5f27002526a808c5c1ad5d0f1ab1cec471af0a33',
        bundleSizes: {
          'dist/v0.js': 12.34,
          'dist/amp4ads-v0.js': 11.22,
          'dist/v0/amp-accordion-0.1.js': 1.11,
          'dist/v0/amp-ad-0.1.js': 4.56,
          'dist/v0/amp-date-display-0.1.js': 7.32,
          'dist/v0/amp-truncate-text-0.1.js': 2.4,
        },
      };

      baseBundleSizeFixture.content = Buffer.from(
        JSON.stringify({
          'dist/v0.js': 12.34,
          'dist/v0/amp-accordion-0.1.js': 1.11,
          'dist/v0/amp-ad-0.1.js': 4.53,
          'dist/v0/amp-anim-0.1.js': 5.65,
          'dist/v0/amp-date-display-0.1.js': 8.99,
          'dist/v0/amp-truncate-text-0.1.js': 2.12,
        })
      ).toString('base64');

      await request(server.expressApp)
        .post('/v0/commit/26ddec3fbbd3c7bd94e05a701c8b8c3ea8826faa/report')
        .send(jsonPayload)
        .set('Content-Type', 'application/json')
        .set('Accept', 'application/json')
        .expect(200);

      expect(github.checks.update).toHaveBeenCalledWith(
        expect.objectContaining({
          check_run_id: 555555,
          conclusion: 'success',
          output: expect.objectContaining({
            title: 'No approval necessary',
            summary: expect.stringContaining(
              '## Auto-approved bundle size changes\n' +
                '* `dist/v0/amp-date-display-0.1.js`: Δ -1.67KB\n' +
                '* `dist/v0/amp-ad-0.1.js`: Δ +0.03KB\n' +
                '* `dist/v0/amp-truncate-text-0.1.js`: Δ +0.28KB\n' +
                '## Bundle sizes missing from this PR\n' +
                '* `dist/v0/amp-anim-0.1.js`: missing in pull request\n' +
                '* `dist/amp4ads-v0.js`: (11.22 KB) missing on the main branch'
            ),
          }),
        })
      );
    });

    test('update a check on bundle-size report with no approvers (report/base = 12.34KB/12.00KB)', async () => {
      await db('checks').insert({
        head_sha: '26ddec3fbbd3c7bd94e05a701c8b8c3ea8826faa',
        owner: 'ampproject',
        repo: 'amphtml',
        pull_request_id: 19603,
        installation_id: 123456,
        check_run_id: 555555,
        approving_teams: null,
        report_markdown: null,
      });

      baseBundleSizeFixture.content =
        Buffer.from('{"dist/v0.js":12}').toString('base64');

      await request(server.expressApp)
        .post('/v0/commit/26ddec3fbbd3c7bd94e05a701c8b8c3ea8826faa/report')
        .send(jsonPayload)
        .set('Content-Type', 'application/json')
        .set('Accept', 'application/json')
        .expect(200);

      await expect(
        db('checks')
          .where({
            head_sha: '26ddec3fbbd3c7bd94e05a701c8b8c3ea8826faa',
          })
          .first()
      ).resolves.toMatchObject({
        head_sha: '26ddec3fbbd3c7bd94e05a701c8b8c3ea8826faa',
        owner: 'ampproject',
        repo: 'amphtml',
        pull_request_id: 19603,
        installation_id: 123456,
        check_run_id: 555555,
        approving_teams: 'ampproject/wg-performance,ampproject/wg-runtime',
        report_markdown:
          '## Commit details\n' +
          '**Head commit:** 26ddec3\n' +
          '**Base commit:** 5f27002\n' +
          '**Code changes:** https://github.com/ampproject/amphtml/compare/5f27002..26ddec3\n\n' +
          '## Bundle size changes that require approval\n' +
          '* `dist/v0.js`: Δ +0.34KB\n' +
          '## Bundle sizes missing from this PR\n' +
          '* `dist/amp4ads-v0.js`: (11.22 KB) missing on the main branch\n' +
          '* `dist/v0/amp-accordion-0.1.js`: (1.11 KB) missing on the main branch\n' +
          '* `dist/v0/amp-ad-0.1.js`: (4.56 KB) missing on the main branch',
      });

      expect(github.checks.update).toHaveBeenCalledWith(
        expect.objectContaining({
          check_run_id: 555555,
          conclusion: 'action_required',
          output: expect.objectContaining({
            title:
              'Approval required from one of [@ampproject/wg-performance, @ampproject/wg-runtime]',
          }),
        })
      );
      expect(github.pulls.listRequestedReviewers).toHaveBeenCalledWith(
        expect.objectContaining({pull_number: 19603})
      );
      expect(github.pulls.listReviews).toHaveBeenCalledWith(
        expect.objectContaining({pull_number: 19603})
      );
      expect(github.pulls.requestReviewers).toHaveBeenCalledWith(
        expect.objectContaining({
          pull_number: 19603,
          reviewers: [
            expect.stringMatching(
              /kristoferbaxter|jridgewell|alanorozco|erwinmombay|kevinkimball|choumx/
            ),
          ],
        })
      );
    });

    test.each([
      [
        'draft = true',
        pullRequest => {
          pullRequest.draft = true;
        },
      ],
      [
        'title contains "WIP"',
        pullRequest => {
          pullRequest.title = `[WIP] ${pullRequest.title}`;
        },
      ],
    ])('do not assign reviewers for a PR with %s', async (_, modify) => {
      await db('checks').insert({
        head_sha: '26ddec3fbbd3c7bd94e05a701c8b8c3ea8826faa',
        owner: 'ampproject',
        repo: 'amphtml',
        pull_request_id: 19603,
        installation_id: 123456,
        check_run_id: 555555,
        approving_teams: null,
      });

      modify(pullRequestFixture);

      baseBundleSizeFixture.content =
        Buffer.from('{"dist/v0.js":12}').toString('base64');

      await request(server.expressApp)
        .post('/v0/commit/26ddec3fbbd3c7bd94e05a701c8b8c3ea8826faa/report')
        .send(jsonPayload)
        .set('Content-Type', 'application/json')
        .set('Accept', 'application/json')
        .expect(200);

      await expect(
        db('checks')
          .where({
            head_sha: '26ddec3fbbd3c7bd94e05a701c8b8c3ea8826faa',
          })
          .first()
      ).resolves.toMatchObject({
        head_sha: '26ddec3fbbd3c7bd94e05a701c8b8c3ea8826faa',
        owner: 'ampproject',
        repo: 'amphtml',
        pull_request_id: 19603,
        installation_id: 123456,
        check_run_id: 555555,
        approving_teams: 'ampproject/wg-performance,ampproject/wg-runtime',
      });

      expect(github.checks.update).toHaveBeenCalledWith(
        expect.objectContaining({
          check_run_id: 555555,
          conclusion: 'action_required',
          output: expect.objectContaining({
            title:
              'Approval required from one of [@ampproject/wg-performance, @ampproject/wg-runtime]',
          }),
        })
      );
    });

    test('update a check on bundle-size report with an existing approver (report/base = 12.34KB/12.00KB)', async () => {
      await db('checks').insert({
        head_sha: '26ddec3fbbd3c7bd94e05a701c8b8c3ea8826faa',
        owner: 'ampproject',
        repo: 'amphtml',
        pull_request_id: 19603,
        installation_id: 123456,
        check_run_id: 555555,
        approving_teams: null,
        report_markdown: null,
      });

      baseBundleSizeFixture.content =
        Buffer.from('{"dist/v0.js":12}').toString('base64');
      const reviews = getFixture('reviews');
      reviews[0].user.login = 'choumx';
      github.pulls.listReviews.mockResolvedValue({data: reviews});

      await request(server.expressApp)
        .post('/v0/commit/26ddec3fbbd3c7bd94e05a701c8b8c3ea8826faa/report')
        .send(jsonPayload)
        .set('Content-Type', 'application/json')
        .set('Accept', 'application/json')
        .expect(200);

      await expect(
        db('checks')
          .where({
            head_sha: '26ddec3fbbd3c7bd94e05a701c8b8c3ea8826faa',
          })
          .first()
      ).resolves.toMatchObject({
        head_sha: '26ddec3fbbd3c7bd94e05a701c8b8c3ea8826faa',
        owner: 'ampproject',
        repo: 'amphtml',
        pull_request_id: 19603,
        installation_id: 123456,
        check_run_id: 555555,
        approving_teams: 'ampproject/wg-performance,ampproject/wg-runtime',
        report_markdown:
          '## Commit details\n' +
          '**Head commit:** 26ddec3\n' +
          '**Base commit:** 5f27002\n' +
          '**Code changes:** https://github.com/ampproject/amphtml/compare/5f27002..26ddec3\n\n' +
          '## Bundle size changes that require approval\n' +
          '* `dist/v0.js`: Δ +0.34KB\n' +
          '## Bundle sizes missing from this PR\n' +
          '* `dist/amp4ads-v0.js`: (11.22 KB) missing on the main branch\n' +
          '* `dist/v0/amp-accordion-0.1.js`: (1.11 KB) missing on the main branch\n' +
          '* `dist/v0/amp-ad-0.1.js`: (4.56 KB) missing on the main branch',
      });

      expect(github.pulls.listRequestedReviewers).toHaveBeenCalled();
      expect(github.pulls.listReviews).toHaveBeenCalled();
      expect(github.pulls.requestReviewers).not.toHaveBeenCalled();
      expect(github.checks.update).toHaveBeenCalled();
    });

    test('update check on bundle-size report (report/_delayed_-base = 12.34KB/12.34KB)', async () => {
      await db('checks').insert({
        head_sha: '26ddec3fbbd3c7bd94e05a701c8b8c3ea8826faa',
        owner: 'ampproject',
        repo: 'amphtml',
        pull_request_id: 19603,
        installation_id: 123456,
        check_run_id: 555555,
        approving_teams: null,
        report_markdown: null,
      });

      baseBundleSizeFixture.content = Buffer.from(
        '{"dist/v0.js":12.34}'
      ).toString('base64');

      let notFoundCount = 2;
      github.repos.getContent.mockImplementation(params => {
        if (
          params.path.endsWith('5f27002526a808c5c1ad5d0f1ab1cec471af0a33.json')
        ) {
          if (notFoundCount > 0) {
            notFoundCount--;
            return Promise.reject({status: 404});
          }
          return Promise.resolve({data: baseBundleSizeFixture});
        }
        const fixture = params.path.replace(/^.+\/(.+)$/, '$1');
        return Promise.resolve({data: getFixture(fixture)});
      });

      await request(server.expressApp)
        .post('/v0/commit/26ddec3fbbd3c7bd94e05a701c8b8c3ea8826faa/report')
        .send(jsonPayload)
        .set('Content-Type', 'application/json')
        .set('Accept', 'application/json')
        .expect(202);

      await expect(
        db('checks')
          .where({
            head_sha: '26ddec3fbbd3c7bd94e05a701c8b8c3ea8826faa',
          })
          .first()
      ).resolves.toMatchObject({
        head_sha: '26ddec3fbbd3c7bd94e05a701c8b8c3ea8826faa',
        owner: 'ampproject',
        repo: 'amphtml',
        pull_request_id: 19603,
        installation_id: 123456,
        check_run_id: 555555,
        approving_teams: null,
        report_markdown: null,
      });

      expect(github.pulls.listRequestedReviewers).not.toHaveBeenCalled();
      expect(github.pulls.listReviews).not.toHaveBeenCalled();
      expect(github.pulls.requestReviewers).not.toHaveBeenCalled();
      expect(github.checks.update).toHaveBeenCalledWith(
        expect.objectContaining({
          conclusion: 'success',
          output: expect.objectContaining({
            title: 'No approval necessary',
          }),
        })
      );
    });

    test('update check on bundle-size report (report/_delayed_-base = 12.34KB/12.23KB)', async () => {
      await db('checks').insert({
        head_sha: '26ddec3fbbd3c7bd94e05a701c8b8c3ea8826faa',
        owner: 'ampproject',
        repo: 'amphtml',
        pull_request_id: 19603,
        installation_id: 123456,
        check_run_id: 555555,
        approving_teams: null,
        report_markdown: null,
      });

      baseBundleSizeFixture.content = Buffer.from(
        '{"dist/v0.js":12.23}'
      ).toString('base64');

      let notFoundCount = 2;
      github.repos.getContent.mockImplementation(params => {
        if (
          params.path.endsWith('5f27002526a808c5c1ad5d0f1ab1cec471af0a33.json')
        ) {
          if (notFoundCount > 0) {
            notFoundCount--;
            return Promise.reject({status: 404});
          }
          return Promise.resolve({data: baseBundleSizeFixture});
        }
        const fixture = params.path.replace(/^.+\/(.+)$/, '$1');
        return Promise.resolve({data: getFixture(fixture)});
      });

      await request(server.expressApp)
        .post('/v0/commit/26ddec3fbbd3c7bd94e05a701c8b8c3ea8826faa/report')
        .send(jsonPayload)
        .set('Content-Type', 'application/json')
        .set('Accept', 'application/json')
        .expect(202);

      await expect(
        db('checks')
          .where({
            head_sha: '26ddec3fbbd3c7bd94e05a701c8b8c3ea8826faa',
          })
          .first()
      ).resolves.toMatchObject({
        head_sha: '26ddec3fbbd3c7bd94e05a701c8b8c3ea8826faa',
        owner: 'ampproject',
        repo: 'amphtml',
        pull_request_id: 19603,
        installation_id: 123456,
        check_run_id: 555555,
        approving_teams: 'ampproject/wg-performance,ampproject/wg-runtime',
        report_markdown:
          '## Commit details\n' +
          '**Head commit:** 26ddec3\n' +
          '**Base commit:** 5f27002\n' +
          '**Code changes:** https://github.com/ampproject/amphtml/compare/5f27002..26ddec3\n\n' +
          '## Bundle size changes that require approval\n' +
          '* `dist/v0.js`: Δ +0.11KB\n' +
          '## Bundle sizes missing from this PR\n' +
          '* `dist/amp4ads-v0.js`: (11.22 KB) missing on the main branch\n' +
          '* `dist/v0/amp-accordion-0.1.js`: (1.11 KB) missing on the main branch\n' +
          '* `dist/v0/amp-ad-0.1.js`: (4.56 KB) missing on the main branch',
      });

      expect(github.pulls.listRequestedReviewers).toHaveBeenCalled();
      expect(github.pulls.listReviews).toHaveBeenCalled();
      expect(github.pulls.requestReviewers).toHaveBeenCalled();
      expect(github.checks.update).toHaveBeenCalledWith(
        expect.objectContaining({
          conclusion: 'action_required',
          output: expect.objectContaining({
            title:
              'Approval required from one of [@ampproject/wg-performance, @ampproject/wg-runtime]',
          }),
        })
      );
    });

    test('update check on bundle-size report with mergeSha (report/_delayed_-base = 12.34KB/12.23KB)', async () => {
      await db('checks').insert({
        head_sha: '26ddec3fbbd3c7bd94e05a701c8b8c3ea8826faa',
        owner: 'ampproject',
        repo: 'amphtml',
        pull_request_id: 19603,
        installation_id: 123456,
        check_run_id: 555555,
        approving_teams: null,
        report_markdown: null,
      });

      baseBundleSizeFixture.content = Buffer.from(
        '{"dist/v0.js":12.23}'
      ).toString('base64');

      let notFoundCount = 2;
      github.repos.getContent.mockImplementation(params => {
        if (
          params.path.endsWith('5f27002526a808c5c1ad5d0f1ab1cec471af0a33.json')
        ) {
          if (notFoundCount > 0) {
            notFoundCount--;
            return Promise.reject({status: 404});
          }
          return Promise.resolve({data: baseBundleSizeFixture});
        }
        const fixture = params.path.replace(/^.+\/(.+)$/, '$1');
        return Promise.resolve({data: getFixture(fixture)});
      });

      await request(server.expressApp)
        .post('/v0/commit/26ddec3fbbd3c7bd94e05a701c8b8c3ea8826faa/report')
        .send({
          ...jsonPayload,
          mergeSha: '9f6fd877fc27c679ad318699ac25a3fb4e228fca',
        })
        .set('Content-Type', 'application/json')
        .set('Accept', 'application/json')
        .expect(202);

      await expect(
        db('checks')
          .where({
            head_sha: '26ddec3fbbd3c7bd94e05a701c8b8c3ea8826faa',
          })
          .first()
      ).resolves.toMatchObject({
        head_sha: '26ddec3fbbd3c7bd94e05a701c8b8c3ea8826faa',
        owner: 'ampproject',
        repo: 'amphtml',
        pull_request_id: 19603,
        installation_id: 123456,
        check_run_id: 555555,
        approving_teams: 'ampproject/wg-performance,ampproject/wg-runtime',
        report_markdown:
          '## Commit details\n' +
          '**Head commit:** 26ddec3\n' +
          '**Base commit:** 5f27002\n' +
          '**Code changes:** 9f6fd87\n\n' +
          '## Bundle size changes that require approval\n' +
          '* `dist/v0.js`: Δ +0.11KB\n' +
          '## Bundle sizes missing from this PR\n' +
          '* `dist/amp4ads-v0.js`: (11.22 KB) missing on the main branch\n' +
          '* `dist/v0/amp-accordion-0.1.js`: (1.11 KB) missing on the main branch\n' +
          '* `dist/v0/amp-ad-0.1.js`: (4.56 KB) missing on the main branch',
      });

      expect(github.pulls.listRequestedReviewers).toHaveBeenCalled();
      expect(github.pulls.listReviews).toHaveBeenCalled();
      expect(github.pulls.requestReviewers).toHaveBeenCalled();
      expect(github.checks.update).toHaveBeenCalledWith(
        expect.objectContaining({
          conclusion: 'action_required',
          output: expect.objectContaining({
            title:
              'Approval required from one of [@ampproject/wg-performance, @ampproject/wg-runtime]',
          }),
        })
      );
    });

    test('update check on bundle-size report on missing base size', async () => {
      await db('checks').insert({
        head_sha: '26ddec3fbbd3c7bd94e05a701c8b8c3ea8826faa',
        owner: 'ampproject',
        repo: 'amphtml',
        pull_request_id: 19603,
        installation_id: 123456,
        check_run_id: 555555,
        approving_teams: null,
        report_markdown: null,
      });

      github.repos.getContent.mockImplementation(params => {
        if (
          params.path.endsWith('5f27002526a808c5c1ad5d0f1ab1cec471af0a33.json')
        ) {
          return Promise.reject({status: 404});
        }
        const fixture = params.path.replace(/^.+\/(.+)$/, '$1');
        return Promise.resolve({data: getFixture(fixture)});
      });

      await request(server.expressApp)
        .post('/v0/commit/26ddec3fbbd3c7bd94e05a701c8b8c3ea8826faa/report')
        .send(jsonPayload)
        .set('Content-Type', 'application/json')
        .set('Accept', 'application/json')
        .expect(202);

      await expect(
        db('checks')
          .where({
            head_sha: '26ddec3fbbd3c7bd94e05a701c8b8c3ea8826faa',
          })
          .first()
      ).resolves.toMatchObject({
        head_sha: '26ddec3fbbd3c7bd94e05a701c8b8c3ea8826faa',
        owner: 'ampproject',
        repo: 'amphtml',
        pull_request_id: 19603,
        installation_id: 123456,
        check_run_id: 555555,
        approving_teams: null,
        report_markdown: null,
      });

      expect(github.pulls.listRequestedReviewers).not.toHaveBeenCalled();
      expect(github.pulls.listReviews).not.toHaveBeenCalled();
      expect(github.pulls.requestReviewers).not.toHaveBeenCalled();
      expect(github.checks.update).toHaveBeenCalledWith(
        expect.objectContaining({
          conclusion: 'action_required',
          output: expect.objectContaining({
            title: 'Failed to retrieve the bundle size of branch point 5f27002',
          }),
        })
      );
    });

    test('match glob patterns in APPROVERS.json', async () => {
      await db('checks').insert({
        head_sha: '26ddec3fbbd3c7bd94e05a701c8b8c3ea8826faa',
        owner: 'ampproject',
        repo: 'amphtml',
        pull_request_id: 19603,
        installation_id: 123456,
        check_run_id: 555555,
        approving_teams: null,
        report_markdown: null,
      });

      baseBundleSizeFixture.content =
        Buffer.from('{"dist/v0.js":12}').toString('base64');

      github.repos.getContent.returnValue = {
        'dist/v0.*': {approvers: ['ampproject/wg-performance'], threshold: 0.1},
      };

      await request(server.expressApp)
        .post('/v0/commit/26ddec3fbbd3c7bd94e05a701c8b8c3ea8826faa/report')
        .send(jsonPayload)
        .set('Content-Type', 'application/json')
        .set('Accept', 'application/json')
        .expect(200);

      await expect(
        db('checks')
          .where({
            head_sha: '26ddec3fbbd3c7bd94e05a701c8b8c3ea8826faa',
          })
          .first()
      ).resolves.toMatchObject({
        head_sha: '26ddec3fbbd3c7bd94e05a701c8b8c3ea8826faa',
        owner: 'ampproject',
        repo: 'amphtml',
        pull_request_id: 19603,
        installation_id: 123456,
        check_run_id: 555555,
        approving_teams: 'ampproject/wg-performance,ampproject/wg-runtime',
        report_markdown: expect.stringContaining('* `dist/v0.js`: Δ +0.34KB'),
      });
    });

    test('ignore bundle-size report for a missing head SHA', async () => {
      await request(server.expressApp)
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
      await request(server.expressApp)
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
      github.repos.getContent.mockRejectedValue({status: 404});

      await request(server.expressApp)
        .post('/v0/commit/5f27002526a808c5c1ad5d0f1ab1cec471af0a33/store')
        .send(jsonPayload)
        .set('Content-Type', 'application/json')
        .set('Accept', 'application/json')
        .expect(200);

      expect(github.repos.getContent).toHaveBeenCalledTimes(1);
      expect(github.repos.createOrUpdateFileContents).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'bundle-size: 5f27002526a808c5c1ad5d0f1ab1cec471af0a33.json',
          content: Buffer.from(
            JSON.stringify(jsonPayload.bundleSizes)
          ).toString('base64'),
        })
      );
    });

    test('ignore already existing bundle-size when called to store', async () => {
      await request(server.expressApp)
        .post('/v0/commit/5f27002526a808c5c1ad5d0f1ab1cec471af0a33/store')
        .send(jsonPayload)
        .set('Content-Type', 'application/json')
        .set('Accept', 'application/json')
        .expect(200);

      expect(github.repos.getContent).toHaveBeenCalledTimes(1);
      expect(github.repos.createOrUpdateFileContents).not.toHaveBeenCalled();
    });

    test('show error when failed to store bundle-size', async () => {
      github.repos.getContent.mockRejectedValue({status: 404});
      github.repos.createOrUpdateFileContents.mockRejectedValue(
        new Error('I am a tea pot')
      );

      await request(server.expressApp)
        .post('/v0/commit/5f27002526a808c5c1ad5d0f1ab1cec471af0a33/store')
        .send(jsonPayload)
        .set('Content-Type', 'application/json')
        .set('Accept', 'application/json')
        .expect(500, /I am a tea pot/);

      expect(logErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining(
          'Failed to create the bundle-size/5f27002526a808c5c1ad5d0f1ab1cec471af0a33.json file'
        ),
        expect.any(Error)
      );
      expect(github.repos.getContent).toHaveBeenCalledTimes(1);
      expect(github.repos.createOrUpdateFileContents).toHaveBeenCalledTimes(1);
    });

    test('fail on non-numeric values when called to store bundle-size', async () => {
      jsonPayload.bundleSizes['dist/shadow-v0.js'] = '23.45KB';

      await request(server.expressApp)
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

      await request(server.expressApp)
        .post('/v0/commit/5f27002526a808c5c1ad5d0f1ab1cec471af0a33/store')
        .send(jsonPayload)
        .set('Content-Type', 'application/json')
        .set('Accept', 'application/json')
        .expect(
          400,
          'POST request to /store must have a key/value object Map<string, number> field "bundleSizes"'
        );
    });

    test('rejects calls to store without the CI token', async () => {
      jsonPayload.token = 'wrong token';

      await request(server.expressApp)
        .post('/v0/commit/5f27002526a808c5c1ad5d0f1ab1cec471af0a33/store')
        .send(jsonPayload)
        .set('Content-Type', 'application/json')
        .set('Accept', 'application/json')
        .expect(403, 'This is not a CI build!');
    });
  });
});
