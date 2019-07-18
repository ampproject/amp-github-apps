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
    unzipAndMove: jest.fn().mockReturnValue(Promise.resolve('gs://serving-bucket/prId')),
  };
});

import {Application} from 'probot';
import prDeployAppFn from '../src/app';
import express from 'express';
import request from 'supertest';
import Webhooks, {
  WebhookPayloadPullRequest,
  WebhookPayloadCheckRun} from '@octokit/webhooks';

describe('test pr deploy app', () => {
  let app: Application;
  let github: any;
  let server: express.Application;

  beforeEach(() => {
    github = {
      checks: {
        create: jest.fn().mockReturnValue(Promise.resolve()),
        update: jest.fn().mockReturnValue(Promise.resolve()),
        listForRef: jest.fn(),
      },
    };

    app = new Application();
    app.load(prDeployAppFn);
    app.auth = async() => Promise.resolve(github);

    server = express();
    server.use(app.router);
  });

  test('creates a check when a pull request is opened', async() => {
    // make sure no checks already exist
    github.checks.listForRef.mockReturnValue(null);

    const prOpenedEvent: Webhooks.WebhookEvent<WebhookPayloadPullRequest> = {
      id: 'prId',
      name: 'pull_request.opened',
      payload: {
        pull_request: {head: {sha: 'abcde'}},
        repository: {owner: {name: 'repoOwner'},name: 'newRepo'},
      } as WebhookPayloadPullRequest,
    };

    await app.receive(prOpenedEvent);
    expect(github.checks.create).toHaveBeenCalled();
    expect(github.checks.update).not.toHaveBeenCalled();
  });

  test('refreshes the check when a pull request is synchronized or reopened',
    async() => {
      // make sure a check already exists
      github.checks.listForRef.mockReturnValue(
        {data: {total_count: 1, check_runs: [{id: 12345}]}}
      );

      const prSynchronizedEvent:
      Webhooks.WebhookEvent<WebhookPayloadPullRequest> = {
        id: 'prId',
        name: 'pull_request.synchronize',
        payload: {
          pull_request: {head: {sha: 'abcde'}},
          repository: {owner: {name: 'repoOwner'},name: 'existingRepo'},
        } as WebhookPayloadPullRequest,
      };

      await app.receive(prSynchronizedEvent);
      expect(github.checks.update).toHaveBeenCalled();
      expect(github.checks.create).not.toHaveBeenCalled();
    });

  test('enables deployment action when post is received', async done => {
    // make sure a check already exists
    github.checks.listForRef.mockReturnValue(
      {data: {total_count: 1, check_runs: [{id: 12345}]}}
    );

    request(server)
      .post('/v0/pr-deploy/owners/1/repos/2/headshas/3/0')
      .expect(() => { expect(github.checks.update).toHaveBeenCalledTimes(1);})
      .expect(200, done);
  });

  test('deploys the PR check when action is triggered', async() => {
    // make sure a check already exists
    github.checks.listForRef.mockReturnValue(
      {data: {total_count: 1, check_runs: [{id: 12345}]}}
    );

    const requestedActionEvent:
    Webhooks.WebhookEvent<WebhookPayloadCheckRun> = {
      id: 'prId',
      name: 'check_run.requested_action',
      payload: {
        action: 'deploy-me-action',
        check_run: {head_sha: 'abcde', pull_requests: [{head: {sha: 'abcde'}}]},
        repository: {owner: {name: 'repoOwner'}, name: 'existingRepo'},
      } as WebhookPayloadCheckRun,
    };

    await app.receive(requestedActionEvent);
    expect(github.checks.update).toHaveBeenCalledTimes(2);
  });
});

