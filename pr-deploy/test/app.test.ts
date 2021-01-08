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

// mock unzipAndMove dependency before importing '../src/app'
jest.mock('../src/zipper', () => {
  return {
    unzipAndMove: jest
      .fn()
      .mockReturnValue(
        Promise.resolve('gs://serving-bucket/ciBuildNumber')
      ),
  };
});

process.env.GH_CHECK = 'test-check';
process.env.GH_OWNER = 'test-owner';
process.env.GH_REPO = 'test-repo';

import nock from 'nock';
import prDeployAppFn from '../src/app';
import Webhooks from '@octokit/webhooks';
import {Probot, ProbotOctokit} from 'probot';

const apiUrl = 'https://api.github.com';

describe('test pr deploy app', () => {
  let probot: Probot;

  beforeEach(() => {
    nock.disableNetConnect();
    probot = new Probot({
      id: 1,
      githubToken: 'test',
      // Disable throttling & retrying requests for easier testing
      Octokit: ProbotOctokit.defaults({
        retry: {enabled: false},
        throttle: {enabled: false},
      }),
    });
    probot.load(prDeployAppFn);
  });

  afterEach(() => {
    expect(nock.isDone()).toBeTruthy();
    nock.cleanAll();
    nock.enableNetConnect();
  });

  test('creates a check when a pull request is opened', async() => {
    const prOpenedEvent: Webhooks.WebhookEvent<
    Webhooks.EventPayloads.WebhookPayloadPullRequest> = {
      id: 'prId',
      name: 'pull_request.opened',
      payload: {
        pull_request: {head: {sha: 'abcde'}},
        repository: {
          owner: {name: 'test-owner'},
          name: 'test-repo',
        },
      } as Webhooks.EventPayloads.WebhookPayloadPullRequest,
    };

    nock(apiUrl)
      .get('/repos/test-owner/test-repo/commits/' +
      'abcde/check-runs?check_name=test-check')
      .reply(200, null) // make sure no checks already exist
      .post('/repos/test-owner/test-repo/check-runs', body => {
        expect(body).toMatchObject({
          'head_sha': 'abcde',
          'name': 'test-check',
          'status': 'queued',
        });
        return true;
      })
      .reply(200);

    await probot.receive(prOpenedEvent);
  });

  test('refreshes the check when a pull request is ' +
  'synchronized or reopened', async() => {
    nock(apiUrl)
      .get('/repos/test-owner/test-repo/commits/' +
      'abcde/check-runs?check_name=test-check')
      .reply(200, {data: {total_count: 1, check_runs: [{id: 12345}]},
      }) // make sure a check already exists
      .post('/repos/test-owner/test-repo/check-runs', body => {
        expect(body).toMatchObject({
          'head_sha': 'abcde',
          'name': 'test-check',
          'status': 'queued',
        });
        return true;
      })
      .reply(200);

    const prSynchronizedEvent: Webhooks.WebhookEvent<
    Webhooks.EventPayloads.WebhookPayloadPullRequest> = {
      id: 'prId',
      name: 'pull_request.synchronize',
      payload: {
        pull_request: {head: {sha: 'abcde'}},
        repository: {owner: {name: 'test-owner'}, name: 'test-repo'},
      } as Webhooks.EventPayloads.WebhookPayloadPullRequest,
    };

    await probot.receive(prSynchronizedEvent);
  });

  test('deploys the PR check when action is triggered', async() => {
    nock(apiUrl)
      .get('/repos/test-owner/test-repo/commits/abcde/' +
      'check-runs?check_name=test-check')
      .times(3)
      .reply(200, {
        total_count: 1,
        check_runs: [
          {id: 12345, output: {text: 'CI build number: 3'}},
        ],
      }) // make sure a check already exists
      .patch('/repos/test-owner/test-repo/check-runs/12345')
      .times(2)
      .reply(201);

    const requestedActionEvent: Webhooks.WebhookEvent<
    Webhooks.EventPayloads.WebhookPayloadCheckRun> = {
      id: 'prId',
      name: 'check_run.requested_action',
      payload: {
        action: 'deploy-me-action',
        check_run: {
          name: 'test-check',
          head_sha: 'abcde',
          pull_requests: [{head: {sha: 'abcde'}}]},
        repository: {owner: {name: 'test-owner'}, name: 'test-repo'},
      } as Webhooks.EventPayloads.WebhookPayloadCheckRun,
    };

    await probot.receive(requestedActionEvent);
  });
});
