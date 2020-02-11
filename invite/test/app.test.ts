/**
 * Copyright 2020 The AMP HTML Authors.
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

import {Probot} from 'probot';
import nock from 'nock';

import {InviteBot} from '../src/invite_bot';
import {triggerWebhook} from './fixtures';

describe('Probot webhooks', () => {
  let probot: Probot;

  beforeAll(() => {
    nock.disableNetConnect();
    process.env = {
      GITHUB_ARG: 'test_org',
      GITHUB_ACCESS_TOKEN: '_TOKEN_',
    };

    probot = new Probot({});
    const app = probot.load(require('../app'));

    // Return a test token for fake authentication flow.
    app.app = {
      getInstallationAccessToken: async () => 'test_token',
      getSignedJsonWebToken: () => 'test_token',
    };
  });

  afterAll(() => {
    nock.enableNetConnect();
  });

  beforeEach(() => {
    jest
      .spyOn(InviteBot.prototype, 'processComment')
      .mockImplementation(async () => {});
    jest
      .spyOn(InviteBot.prototype, 'processAcceptedInvite')
      .mockImplementation(async () => {});

    nock('https://api.github.com')
      .post('/app/installations/588033/access_tokens')
      .reply(200, {token: 'test'});
  });

  afterEach(() => {
    jest.restoreAllMocks();

    // Fail the test if there were unused nocks.
    if (!nock.isDone()) {
      throw new Error('Not all nock interceptors were used!');
      nock.cleanAll();
    }
  });

  [
    'issue_comment.created',
    'pull_request_review.submitted',
    'pull_request_review_comment.created',
  ].forEach(eventName => {
    describe(`on ${eventName} event`, () => {
      it('processes the comment for macros', async done => {
        expect(InviteBot.prototype.processComment).toBeCalledWith(
          'test_repo',
          1337,
          'Test comment'
        );

        await triggerWebhook(probot, eventName);
        done();
      });
    });
  });

  [
    'issue_comment.edited',
    'issue_comment.deleted',
    'pull_request_review.edited',
    'pull_request_review.dismissed',
    'pull_request_review_comment.edited',
    'pull_request_review_comment.deleted',
  ].forEach(eventName => {
    describe(`on ${eventName} event`, () => {
      it('does not processes the comment', async done => {
        expect(InviteBot.prototype.processComment).toBeCalledWith(
          'test_repo',
          1337,
          'Test comment'
        );

        await triggerWebhook(probot, eventName);
        done();
      });
    });
  });

  describe('on organization.member_added event', () => {
    it('processes the accepted invite with follow-up actions', async done => {
      expect(InviteBot.prototype.processComment).toBeCalledWith(
        'test_repo',
        'someone'
      );

      await triggerWebhook(probot, 'organization.member_added');
      done();
    });
  });

  describe('on organization.member_invited event', () => {
    it('does not process the new membership', async done => {
      expect(InviteBot.prototype.processComment).not.toBeCalledWith();

      await triggerWebhook(probot, 'organization.member_invited');
      done();
    });
  });

  describe('on organization.member_removed event', () => {
    it('does not process the new membership', async done => {
      expect(InviteBot.prototype.processComment).not.toBeCalledWith();

      await triggerWebhook(probot, 'organization.member_removed');
      done();
    });
  });
});
