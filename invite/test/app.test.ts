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
import app from '../app';

describe('Probot webhooks', () => {
  let probot: Probot;

  beforeAll(() => {
    nock.disableNetConnect();
    process.env = {
      DISABLE_WEBHOOK_EVENT_CHECK: 'true',
      GITHUB_ORG: 'test_org',
      GITHUB_ACCESS_TOKEN: '_TOKEN_',
      NODE_ENV: 'test',
    };

    probot = new Probot({});
    const probotApp = probot.load(app);
    probotApp.app = {
      getInstallationAccessToken: async () => 'test',
      getSignedJsonWebToken: () => 'test',
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
  });

  afterEach(() => {
    jest.restoreAllMocks();

    // Fail the test if there were unused nocks.
    if (!nock.isDone()) {
      throw new Error('Not all nock interceptors were used!');
      nock.cleanAll();
    }
  });

  describe.each([
    ['issue_comment.created'],
    ['issues.opened'],
    ['pull_request.opened'],
    ['pull_request_review.submitted'],
    ['pull_request_review_comment.created'],
  ])(`on %p event`, eventName => {
    it('processes the comment for macros', async done => {
      await triggerWebhook(probot, eventName);

      expect(InviteBot.prototype.processComment).toBeCalledWith(
        'test_repo',
        1337,
        'Test comment'
      );
      done();
    });
  });

  describe.each([
    ['issue_comment.edited'],
    ['issue_comment.deleted'],
    ['pull_request_review.edited'],
    ['pull_request_review.dismissed'],
    ['pull_request_review_comment.edited'],
    ['pull_request_review_comment.deleted'],
  ])(`on %p event`, eventName => {
    it('does not processes the comment', async done => {
      await triggerWebhook(probot, eventName);

      expect(InviteBot.prototype.processComment).not.toBeCalled();
      done();
    });
  });

  describe('on "organization.member_added" event', () => {
    it('processes the accepted invite with follow-up actions', async done => {
      await triggerWebhook(probot, 'organization.member_added');

      expect(InviteBot.prototype.processAcceptedInvite).toBeCalledWith(
        'someone_else'
      );
      done();
    });
  });

  describe('on "organization.member_invited" event', () => {
    it('does not process the new membership', async done => {
      await triggerWebhook(probot, 'organization.member_invited');

      expect(InviteBot.prototype.processAcceptedInvite).not.toBeCalledWith();
      done();
    });
  });

  describe('on "organization.member_removed" event', () => {
    it('does not process the new membership', async done => {
      await triggerWebhook(probot, 'organization.member_removed');

      expect(InviteBot.prototype.processAcceptedInvite).not.toBeCalledWith();
      done();
    });
  });
});
