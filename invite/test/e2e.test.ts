/**
 * Copyright 2020 The AMP HTML Authors. All Rights Reserved.
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

import nock from 'nock';
import {Probot} from 'probot';

import app from '../app';
import {triggerWebhook, getFixture} from './fixtures';

describe('end-to-end', () => {
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
      getInstallationAccessToken: () => Promise.resolve('test'),
      getSignedJsonWebToken: () => 'test',
    };

  });

  afterAll(() => {
    nock.enableNetConnect();
  });

  afterEach(() => {
    jest.restoreAllMocks();

    // Fail the test if there were unused nocks.
    if (!nock.isDone()) {
      throw new Error('Not all nock interceptors were used!');
      nock.cleanAll();
    }
  });

  describe('when a comment includes "/invite @someone"', () => {
    describe('when @someone is a member of the org', () => {
      it.todo('comments');
    });
    
    describe('when @someone is not a member of the org', () => {
      it.todo('invites, records, comments');

      describe('once the invite is accepted', () => {
        it.todo('comments, archives');
      });
    });
  });

  describe('when a comment includes "/tryassign @someone"', () => {
    describe('when @someone is a member of the org', () => {
      it.todo('assigns, comments')
    });

    describe('when @someone is not a member of the org', () => {
      it.todo('invites, records, comments');

      describe('once the invite is accepted', () => {
        it.todo('assigns, comments, archives');
      });
    });
  });

  describe('when a comment includes no macros', () => {
    it.todo('ignores it');
  });

  describe('when someone joins without a recorded invitation', () => {
    it.todo('ignores it');
  })
});
