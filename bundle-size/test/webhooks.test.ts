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

import {type Logger, Options, Probot} from 'probot';
import {mockDeep, mockReset} from 'jest-mock-extended';
import NodeCache from 'node-cache';
import nock from 'nock';

import {GitHubUtils} from '../src/github-utils';
import {inMemoryDbConnect} from './_test_helper';
import {installGitHubWebhooks} from '../src/webhooks';
import {setupDb} from '../src/db';

import type {RestEndpointMethodTypes} from '@octokit/plugin-rest-endpoint-methods';
import type {RestfulOctokit} from '../src/types/rest-endpoint-methods';

import baseCheckRunFixture from './fixtures/check_run.created.json';
import basePullRequestOpenedFixture from './fixtures/pull_request.opened.json';
import basePullRequestReviewSubmittedFixture from './fixtures/pull_request_review.submitted.json';
import listTeamMembersWgInfra from './fixtures/teams.listMembersInOrg.wg-infra.json';
import listTeamMembersWgPerformance from './fixtures/teams.listMembersInOrg.wg-performance.json';
import listTeamMembersWgRuntime from './fixtures/teams.listMembersInOrg.wg-runtime.json';

import {EmitterWebhookEvent} from '@octokit/webhooks';

declare type CheckRunEvent = EmitterWebhookEvent<'check_run'>;
declare type PullRequestEvent = EmitterWebhookEvent<'pull_request'>;
declare type PullRequestReviewEvent =
  EmitterWebhookEvent<'pull_request_review'>;

nock.disableNetConnect();
nock.enableNetConnect('127.0.0.1');

describe('bundle-size webhooks', () => {
  const mockGithub = mockDeep<RestfulOctokit>();
  const mockLog = mockDeep<Logger>();

  const db = inMemoryDbConnect();
  const nodeCache = new NodeCache();
  const githubUtils = new GitHubUtils(mockGithub, mockLog, nodeCache);

  let checkRunPayload: CheckRunEvent['payload'];
  let pullRequestPayload: PullRequestEvent['payload'];
  let pullRequestReviewPayload: PullRequestReviewEvent['payload'];
  let probot: Probot;

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
    checkRunPayload = structuredClone(
      baseCheckRunFixture
    ) as unknown as CheckRunEvent['payload'];
    pullRequestPayload = structuredClone(
      basePullRequestOpenedFixture
    ) as unknown as PullRequestEvent['payload'];
    pullRequestReviewPayload = structuredClone(
      basePullRequestReviewSubmittedFixture
    ) as unknown as PullRequestReviewEvent['payload'];

    mockGithub.rest.checks.create.mockResolvedValue({
      data: {id: 555555},
    } as unknown as RestEndpointMethodTypes['checks']['create']['response']);
    mockGithub.rest.teams.listMembersInOrg.mockImplementation(
      mockListMembersInOrgByTeamSlug_
    );

    probot = new Probot({
      Octokit: class FakeOctokitFactory {
        static defaults = () =>
          class FakeOctokit {
            auth = () => mockGithub;
          };
      } as unknown as Options['Octokit'],
    });
    await probot.load(app => {
      installGitHubWebhooks(app, db, githubUtils);
    });

    nodeCache.flushAll();

    process.env = {
      DISABLE_WEBHOOK_EVENT_CHECK: 'true',
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

  describe('pull_request', () => {
    test('create a new pending check when a pull request is opened', async () => {
      await probot.receive({
        name: 'pull_request',
        payload: pullRequestPayload,
      } as PullRequestEvent);

      await expect(db('checks').select('*')).resolves.toEqual([
        {
          head_sha: '39f787c8132f9ccc956ed465c0af8bc33f641404',
          owner: 'ampproject',
          repo: 'amphtml',
          pull_request_id: 19621,
          installation_id: 123456,
          check_run_id: 555555,
          approving_teams: null,
          report_markdown: null,
        },
      ]);

      expect(mockGithub.rest.checks.create).toHaveBeenCalledWith(
        expect.objectContaining({
          head_sha: '39f787c8132f9ccc956ed465c0af8bc33f641404',
          name: 'ampproject/bundle-size',
          output: expect.objectContaining({
            title: 'Calculating new bundle size for this PR…',
          }),
        })
      );
    });

    test('update a pending check when a pull request is synced', async () => {
      await db('checks').insert({
        head_sha: '39f787c8132f9ccc956ed465c0af8bc33f641404',
        owner: 'ampproject',
        repo: 'amphtml',
        pull_request_id: 19621,
        installation_id: 123456,
        check_run_id: 444444,
        approving_teams: null,
        report_markdown: null,
      });

      await probot.receive({
        name: 'pull_request',
        payload: pullRequestPayload,
      } as PullRequestEvent);

      await expect(db('checks').select('*')).resolves.toEqual([
        {
          head_sha: '39f787c8132f9ccc956ed465c0af8bc33f641404',
          owner: 'ampproject',
          repo: 'amphtml',
          pull_request_id: 19621,
          installation_id: 123456,
          check_run_id: 555555,
          approving_teams: null,
          report_markdown: null,
        },
      ]);

      expect(mockGithub.rest.checks.create).toHaveBeenCalledWith(
        expect.objectContaining({
          head_sha: '39f787c8132f9ccc956ed465c0af8bc33f641404',
          name: 'ampproject/bundle-size',
          output: expect.objectContaining({
            title: 'Calculating new bundle size for this PR…',
          }),
        })
      );
    });

    test('ignore closed (not merged) pull request', async () => {
      pullRequestPayload.action = 'closed';

      await probot.receive({
        name: 'pull_request',
        payload: pullRequestPayload,
      } as PullRequestEvent);
      await expect(db('merges').select('*')).resolves.toEqual([]);

      await probot.receive({
        name: 'check_run',
        payload: checkRunPayload,
      } as CheckRunEvent);

      expect(mockGithub.rest.checks.create).not.toHaveBeenCalled();
    });

    test('skip the check on a merged pull request', async () => {
      Object.assign(pullRequestPayload, {
        action: 'closed',
        pull_request: {
          merged_at: '2019-02-25T20:21:58Z',
          merge_commit_sha: '4ba02c691d1a3014f70a7521c07d775dc6a1e355',
        },
      });

      await probot.receive({
        name: 'pull_request',
        payload: pullRequestPayload,
      } as PullRequestEvent);
      await expect(db('merges').select('*')).resolves.toEqual([
        {merge_commit_sha: '4ba02c691d1a3014f70a7521c07d775dc6a1e355'},
      ]);

      await probot.receive({
        name: 'check_run',
        payload: checkRunPayload,
      } as CheckRunEvent);
      await expect(db('merges').select('*')).resolves.toEqual([]);

      expect(mockGithub.rest.checks.update).toHaveBeenCalledWith(
        expect.objectContaining({
          check_run_id: 68609861,
          conclusion: 'neutral',
          output: expect.objectContaining({
            title: 'Check skipped because this is a merged commit',
          }),
        })
      );
    });

    test('fail when a pull request is reported as merged twice', async () => {
      Object.assign(pullRequestPayload, {
        action: 'closed',
        pull_request: {
          merged_at: '2019-02-25T20:21:58Z',
          merge_commit_sha: '4ba02c691d1a3014f70a7521c07d775dc6a1e355',
        },
      });

      await probot.receive({
        name: 'pull_request',
        payload: pullRequestPayload,
      } as PullRequestEvent);

      try {
        await probot.receive({
          name: 'pull_request',
          payload: pullRequestPayload,
        } as PullRequestEvent);
      } catch (e) {
        expect(e.message).toContain('UNIQUE constraint failed');
      }
    });
  });

  describe('pull_request_review', () => {
    test.each([
      ['with no report_markdown', ''],
      ['with a report_markdown', '* `dist/v0/amp-ad-0.1.js`: Δ +0.34KB'],
    ])(
      'mark a check as successful when a capable user approves the PR %s',
      async (_, reportMarkdown) => {
        await db('checks').insert({
          head_sha: '26ddec3fbbd3c7bd94e05a701c8b8c3ea8826faa',
          owner: 'ampproject',
          repo: 'amphtml',
          pull_request_id: 19603,
          installation_id: 123456,
          check_run_id: 555555,
          approving_teams: 'ampproject/wg-performance,ampproject/wg-runtime',
          report_markdown: reportMarkdown,
        });

        await probot.receive({
          name: 'pull_request_review',
          payload: pullRequestReviewPayload,
        } as PullRequestReviewEvent);

        expect(mockGithub.rest.checks.update).toHaveBeenCalledWith(
          expect.objectContaining({
            conclusion: 'success',
            output: expect.objectContaining({
              title: 'approved by @choumx',
              summary: expect.stringContaining(
                'The bundle size change(s) of this pull request were approved by @choumx'
              ),
            }),
          })
        );
        expect(mockGithub.rest.checks.update).toHaveBeenCalledWith(
          expect.objectContaining({
            output: expect.objectContaining({
              summary: expect.stringContaining(reportMarkdown),
            }),
          })
        );
      }
    );

    test('mark a preemptive approval check as successful when a super user approves the PR', async () => {
      pullRequestReviewPayload.review.user!.login = 'rsimha';

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

      await probot.receive({
        name: 'pull_request_review',
        payload: pullRequestReviewPayload,
      } as PullRequestReviewEvent);

      expect(mockGithub.rest.checks.update).toHaveBeenCalledWith(
        expect.objectContaining({
          conclusion: 'success',
          output: expect.objectContaining({
            title: 'approved by @rsimha',
          }),
        })
      );
    });

    test('ignore a preemptive approval', async () => {
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

      await probot.receive({
        name: 'pull_request_review',
        payload: pullRequestReviewPayload,
      } as PullRequestReviewEvent);

      expect(mockGithub.rest.checks.update).not.toHaveBeenCalled();
    });

    test('ignore an approved review by a non-capable reviewer', async () => {
      await probot.receive({
        name: 'pull_request_review',
        payload: pullRequestReviewPayload,
      } as PullRequestReviewEvent);

      expect(mockGithub.rest.checks.update).not.toHaveBeenCalled();
    });

    test('ignore a "changes requested" review', async () => {
      pullRequestReviewPayload.review.state = 'changes_requested';

      await probot.receive({
        name: 'pull_request_review',
        payload: pullRequestReviewPayload,
      } as PullRequestReviewEvent);

      expect(mockGithub.rest.checks.update).not.toHaveBeenCalled();
    });

    test('ignore an approved review by a capable reviewer for small delta', async () => {
      await db('checks').insert({
        head_sha: '26ddec3fbbd3c7bd94e05a701c8b8c3ea8826faa',
        owner: 'ampproject',
        repo: 'amphtml',
        pull_request_id: 19603,
        installation_id: 123456,
        check_run_id: 555555,
        approving_teams: '',
        report_markdown: null,
      });

      await probot.receive({
        name: 'pull_request_review',
        payload: pullRequestReviewPayload,
      } as PullRequestReviewEvent);

      expect(mockGithub.rest.checks.update).not.toHaveBeenCalled();
    });

    test('ignore an approved review by a capable reviewer for unknown PRs', async () => {
      await probot.receive({
        name: 'pull_request_review',
        payload: pullRequestReviewPayload,
      } as PullRequestReviewEvent);

      expect(mockGithub.rest.checks.update).not.toHaveBeenCalled();
    });
  });
});
