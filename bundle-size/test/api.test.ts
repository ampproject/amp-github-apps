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

import {Logger} from 'probot';
import {mockDeep, mockReset} from 'jest-mock-extended';
import NodeCache from 'node-cache';
import express, {type Application} from 'express';
import nock from 'nock';
import request from 'supertest';

import {GitHubUtils} from '../src/github-utils';
import {StorePayload} from '../src/types/payload';
import {inMemoryDbConnect} from './_test_helper';
import {installApiRouter} from '../src/api';
import {setupDb} from '../src/db';

import type {RestEndpointMethodTypes} from '@octokit/plugin-rest-endpoint-methods';
import type {RestfulOctokit} from '../src/types/rest-endpoint-methods';

import baseApproversFixture from './fixtures/APPROVERS.json.json';
import baseBundleSizeFixture from './fixtures/5f27002526a808c5c1ad5d0f1ab1cec471af0a33.json.json';
import basePullRequestFixture from './fixtures/pulls.get.19603.json';
import baseReviewsFixture from './fixtures/reviews.json';
import listTeamMembersWgInfra from './fixtures/teams.listMembersInOrg.wg-infra.json';
import listTeamMembersWgPerformance from './fixtures/teams.listMembersInOrg.wg-performance.json';
import listTeamMembersWgRuntime from './fixtures/teams.listMembersInOrg.wg-runtime.json';
import requestedReviewersFixture from './fixtures/requested_reviewers.json';

nock.disableNetConnect();
nock.enableNetConnect('127.0.0.1');
jest.mock('sleep-promise', () => async () => Promise.resolve());

describe('bundle-size api', () => {
  const mockGithub = mockDeep<RestfulOctokit>();
  const mockLog = mockDeep<Logger>();
  const mockAuth = jest.fn().mockResolvedValue(mockGithub);

  const db = inMemoryDbConnect();
  const nodeCache = new NodeCache();
  const githubUtils = new GitHubUtils(mockGithub, mockLog, nodeCache);

  let approversFixture: typeof baseApproversFixture;
  let bundleSizeFixture: typeof baseBundleSizeFixture;
  let pullRequestFixture: typeof basePullRequestFixture;
  let reviewsFixture: typeof baseReviewsFixture;
  let app: Application;

  async function mockGetContentByFilePath_(
    params: RestEndpointMethodTypes['repos']['getContent']['parameters']
  ) {
    expect(params.path).toMatch(/(1af0a33|APPROVERS).json$/);
    return {
      data: params.path.endsWith('1af0a33.json')
        ? bundleSizeFixture
        : params.path.endsWith('APPROVERS.json')
          ? approversFixture
          : undefined,
    } as unknown as RestEndpointMethodTypes['repos']['getContent']['response'];
  }

  async function mockListMembersInOrgByTeamSlug_(
    params: RestEndpointMethodTypes['teams']['listMembersInOrg']['parameters']
  ) {
    expect(params.team_slug).toMatch(/^wg-(infra|performance|runtime)$/);
    return {
      data:
        params.team_slug === 'wg-infra'
          ? listTeamMembersWgInfra
          : params.team_slug === 'wg-performance'
            ? listTeamMembersWgPerformance
            : params.team_slug === 'wg-runtime'
              ? listTeamMembersWgRuntime
              : undefined,
    } as unknown as RestEndpointMethodTypes['teams']['listMembersInOrg']['response'];
  }

  beforeAll(async () => {
    await setupDb(db);
  });

  beforeEach(async () => {
    approversFixture = structuredClone(baseApproversFixture);
    pullRequestFixture = structuredClone(basePullRequestFixture);
    bundleSizeFixture = structuredClone(baseBundleSizeFixture);
    reviewsFixture = structuredClone(baseReviewsFixture);

    mockGithub.rest.pulls.get.mockResolvedValue({
      data: pullRequestFixture,
    } as unknown as RestEndpointMethodTypes['pulls']['get']['response']);
    mockGithub.rest.pulls.listRequestedReviewers.mockResolvedValue({
      data: requestedReviewersFixture,
    } as unknown as RestEndpointMethodTypes['pulls']['listRequestedReviewers']['response']);
    mockGithub.rest.pulls.listReviews.mockResolvedValue({
      data: reviewsFixture,
    } as unknown as RestEndpointMethodTypes['pulls']['listReviews']['response']);
    mockGithub.rest.repos.getContent.mockImplementation(
      mockGetContentByFilePath_
    );
    mockGithub.rest.teams.listMembersInOrg.mockImplementation(
      mockListMembersInOrgByTeamSlug_
    );

    app = express();
    const router = express.Router();
    installApiRouter(mockLog, mockAuth, router, db, githubUtils);
    app.use('/v0', router);

    process.env = {
      CI_PUSH_BUILD_TOKEN: '0123456789abcdefghijklmnopqrstuvwxyz',
      FALLBACK_APPROVER_TEAMS:
        'ampproject/wg-runtime,ampproject/wg-performance',
      SUPER_USER_TEAMS: 'ampproject/wg-infra',
    };
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    // Deep mocks from 'jest-mock-extended' require an explicit reset.
    mockReset(mockGithub);
    mockReset(mockLog);
    nodeCache.flushAll();
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

      await request(app)
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

      expect(mockGithub.rest.checks.update).toHaveBeenCalledWith(
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
      await request(app)
        .post('/v0/commit/26ddec3fbbd3c7bd94e05a701c8b8c3ea8826faa/skip')
        .expect(404);

      expect(mockGithub.rest.checks.update).not.toHaveBeenCalled();
    });
  });

  describe('/commit/:headSha/report', () => {
    let jsonPayload: StorePayload;

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

        bundleSizeFixture.content = Buffer.from(
          `{"dist/v0.js":${baseSize}}`
        ).toString('base64');

        await request(app)
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

        expect(mockGithub.rest.checks.update).toHaveBeenCalledWith(
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

      bundleSizeFixture.content = Buffer.from(
        '{"dist/v0.js": 12.34,"dist/v0/amp-accordion-0.1.js":1.11,"dist/v0/amp-ad-0.1.js": 4.53,"dist/v0/amp-anim-0.1.js": 5.65}'
      ).toString('base64');

      await request(app)
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

      expect(mockGithub.rest.checks.update).toHaveBeenCalledWith(
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

      bundleSizeFixture.content = Buffer.from(
        JSON.stringify({
          'dist/v0.js': 12.34,
          'dist/v0/amp-accordion-0.1.js': 1.11,
          'dist/v0/amp-ad-0.1.js': 4.53,
          'dist/v0/amp-anim-0.1.js': 5.65,
          'dist/v0/amp-date-display-0.1.js': 8.99,
          'dist/v0/amp-truncate-text-0.1.js': 2.12,
        })
      ).toString('base64');

      await request(app)
        .post('/v0/commit/26ddec3fbbd3c7bd94e05a701c8b8c3ea8826faa/report')
        .send(jsonPayload)
        .set('Content-Type', 'application/json')
        .set('Accept', 'application/json')
        .expect(200);

      expect(mockGithub.rest.checks.update).toHaveBeenCalledWith(
        expect.objectContaining({
          check_run_id: 555555,
          conclusion: 'success',
          output: expect.objectContaining({
            title: 'No approval necessary',
            summary: expect.stringContaining(
              '## Auto-approved bundle size changes\n' +
                '* `dist/v0/amp-truncate-text-0.1.js`: Δ +0.28KB\n' +
                '* `dist/v0/amp-ad-0.1.js`: Δ +0.03KB\n' +
                '* `dist/v0/amp-date-display-0.1.js`: Δ -1.67KB\n' +
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

      bundleSizeFixture.content =
        Buffer.from('{"dist/v0.js":12}').toString('base64');

      await request(app)
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

      expect(mockGithub.rest.checks.update).toHaveBeenCalledWith(
        expect.objectContaining({
          check_run_id: 555555,
          conclusion: 'action_required',
          output: expect.objectContaining({
            title:
              'Approval required from one of [@ampproject/wg-performance, @ampproject/wg-runtime]',
          }),
        })
      );
      expect(mockGithub.rest.pulls.listRequestedReviewers).toHaveBeenCalledWith(
        expect.objectContaining({pull_number: 19603})
      );
      expect(mockGithub.rest.pulls.listReviews).toHaveBeenCalledWith(
        expect.objectContaining({pull_number: 19603})
      );
      expect(mockGithub.rest.pulls.requestReviewers).toHaveBeenCalledWith(
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
        (pullRequest: typeof pullRequestFixture) => {
          pullRequest.draft = true;
        },
      ],
      [
        'title contains "WIP"',
        (pullRequest: typeof pullRequestFixture) => {
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

      bundleSizeFixture.content =
        Buffer.from('{"dist/v0.js":12}').toString('base64');

      await request(app)
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

      expect(mockGithub.rest.checks.update).toHaveBeenCalledWith(
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

      bundleSizeFixture.content =
        Buffer.from('{"dist/v0.js":12}').toString('base64');
      reviewsFixture[0].user.login = 'choumx';

      await request(app)
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

      expect(mockGithub.rest.pulls.listRequestedReviewers).toHaveBeenCalled();
      expect(mockGithub.rest.pulls.listReviews).toHaveBeenCalled();
      expect(mockGithub.rest.pulls.requestReviewers).not.toHaveBeenCalled();
      expect(mockGithub.rest.checks.update).toHaveBeenCalled();
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

      bundleSizeFixture.content = Buffer.from('{"dist/v0.js":12.34}').toString(
        'base64'
      );

      mockGithub.rest.repos.getContent
        .mockRejectedValueOnce({status: 404})
        .mockRejectedValueOnce({status: 404})
        .mockImplementation(mockGetContentByFilePath_);

      await request(app)
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

      expect(
        mockGithub.rest.pulls.listRequestedReviewers
      ).not.toHaveBeenCalled();
      expect(mockGithub.rest.pulls.listReviews).not.toHaveBeenCalled();
      expect(mockGithub.rest.pulls.requestReviewers).not.toHaveBeenCalled();
      expect(mockGithub.rest.checks.update).toHaveBeenCalledWith(
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

      bundleSizeFixture.content = Buffer.from('{"dist/v0.js":12.23}').toString(
        'base64'
      );

      mockGithub.rest.repos.getContent
        .mockRejectedValueOnce({status: 404})
        .mockRejectedValueOnce({status: 404})
        .mockImplementation(mockGetContentByFilePath_);

      await request(app)
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

      expect(mockGithub.rest.pulls.listRequestedReviewers).toHaveBeenCalled();
      expect(mockGithub.rest.pulls.listReviews).toHaveBeenCalled();
      expect(mockGithub.rest.pulls.requestReviewers).toHaveBeenCalled();
      expect(mockGithub.rest.checks.update).toHaveBeenCalledWith(
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

      bundleSizeFixture.content = Buffer.from('{"dist/v0.js":12.23}').toString(
        'base64'
      );

      mockGithub.rest.repos.getContent
        .mockRejectedValueOnce({status: 404})
        .mockRejectedValueOnce({status: 404})
        .mockImplementation(mockGetContentByFilePath_);

      await request(app)
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

      expect(mockGithub.rest.pulls.listRequestedReviewers).toHaveBeenCalled();
      expect(mockGithub.rest.pulls.listReviews).toHaveBeenCalled();
      expect(mockGithub.rest.pulls.requestReviewers).toHaveBeenCalled();
      expect(mockGithub.rest.checks.update).toHaveBeenCalledWith(
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

      mockGithub.rest.repos.getContent.mockRejectedValue({status: 404});

      await request(app)
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

      expect(
        mockGithub.rest.pulls.listRequestedReviewers
      ).not.toHaveBeenCalled();
      expect(mockGithub.rest.pulls.listReviews).not.toHaveBeenCalled();
      expect(mockGithub.rest.pulls.requestReviewers).not.toHaveBeenCalled();
      expect(mockGithub.rest.checks.update).toHaveBeenCalledWith(
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

      bundleSizeFixture.content =
        Buffer.from('{"dist/v0.js":12}').toString('base64');
      approversFixture.content = Buffer.from(
        '{"dist/v0.*":{"approvers":["ampproject/wg-performance"],"threshold":0.1}}'
      ).toString('base64');

      await request(app)
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
        approving_teams: 'ampproject/wg-performance',
        report_markdown: expect.stringContaining('* `dist/v0.js`: Δ +0.34KB'),
      });
    });

    test('ignore bundle-size report for a missing head SHA', async () => {
      await request(app)
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
      await request(app)
        .post('/v0/commit/26ddec3fbbd3c7bd94e05a701c8b8c3ea8826faa/report')
        .send(data)
        .set('Content-Type', 'application/json')
        .set('Accept', 'application/json')
        .expect(400);
    });
  });

  describe('/commit/:headSha/store', () => {
    let jsonPayload: StorePayload;

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
      mockGithub.rest.repos.getContent.mockRejectedValue({status: 404});

      await request(app)
        .post('/v0/commit/5f27002526a808c5c1ad5d0f1ab1cec471af0a33/store')
        .send(jsonPayload)
        .set('Content-Type', 'application/json')
        .set('Accept', 'application/json')
        .expect(200);

      expect(mockGithub.rest.repos.getContent).toHaveBeenCalledTimes(1);
      expect(
        mockGithub.rest.repos.createOrUpdateFileContents
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'bundle-size: 5f27002526a808c5c1ad5d0f1ab1cec471af0a33.json',
          content: Buffer.from(
            JSON.stringify(jsonPayload.bundleSizes)
          ).toString('base64'),
        })
      );
    });

    test('ignore already existing bundle-size when called to store', async () => {
      await request(app)
        .post('/v0/commit/5f27002526a808c5c1ad5d0f1ab1cec471af0a33/store')
        .send(jsonPayload)
        .set('Content-Type', 'application/json')
        .set('Accept', 'application/json')
        .expect(200);

      expect(mockGithub.rest.repos.getContent).toHaveBeenCalledTimes(1);
      expect(
        mockGithub.rest.repos.createOrUpdateFileContents
      ).not.toHaveBeenCalled();
    });

    test('show error when failed to store bundle-size', async () => {
      mockGithub.rest.repos.getContent.mockRejectedValue({status: 404});
      mockGithub.rest.repos.createOrUpdateFileContents.mockRejectedValue(
        new Error('I am a tea pot')
      );

      await request(app)
        .post('/v0/commit/5f27002526a808c5c1ad5d0f1ab1cec471af0a33/store')
        .send(jsonPayload)
        .set('Content-Type', 'application/json')
        .set('Accept', 'application/json')
        .expect(500, /I am a tea pot/);

      expect(mockLog.error).toHaveBeenCalledWith(
        expect.stringContaining(
          'Failed to create the bundle-size/5f27002526a808c5c1ad5d0f1ab1cec471af0a33.json file'
        ),
        expect.any(Error)
      );
      expect(mockGithub.rest.repos.getContent).toHaveBeenCalledTimes(1);
      expect(
        mockGithub.rest.repos.createOrUpdateFileContents
      ).toHaveBeenCalledTimes(1);
    });

    test('fail on non-numeric values when called to store bundle-size', async () => {
      /* @ts-expect-error Testing an incorrect API call. */
      jsonPayload.bundleSizes['dist/shadow-v0.js'] = '23.45KB';

      await request(app)
        .post('/v0/commit/5f27002526a808c5c1ad5d0f1ab1cec471af0a33/store')
        .send(jsonPayload)
        .set('Content-Type', 'application/json')
        .set('Accept', 'application/json')
        .expect(
          400,
          'POST request to /store must have a key/value object Record<string, number> field "bundleSizes"'
        );
    });

    test('fail on missing values when called to store bundle-size', async () => {
      /* @ts-expect-error Testing an incorrect API call. */
      delete jsonPayload.bundleSizes;

      await request(app)
        .post('/v0/commit/5f27002526a808c5c1ad5d0f1ab1cec471af0a33/store')
        .send(jsonPayload)
        .set('Content-Type', 'application/json')
        .set('Accept', 'application/json')
        .expect(
          400,
          'POST request to /store must have a key/value object Record<string, number> field "bundleSizes"'
        );
    });

    test('rejects calls to store without the CI token', async () => {
      /* @ts-expect-error Testing an incorrect API call. */
      jsonPayload.token = 'wrong token';

      await request(app)
        .post('/v0/commit/5f27002526a808c5c1ad5d0f1ab1cec471af0a33/store')
        .send(jsonPayload)
        .set('Content-Type', 'application/json')
        .set('Accept', 'application/json')
        .expect(403, 'This is not a CI build!');
    });
  });
});
