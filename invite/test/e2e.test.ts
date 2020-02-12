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

import Knex from 'knex';
import {mocked} from 'ts-jest/utils';
import nock from 'nock';
import {Probot} from 'probot';

import app from '../app';
import {Database, dbConnect} from '../src/db';
import {InviteAction} from '../src/types';
import {setupDb} from '../src/setup_db';
import {triggerWebhook, getFixture} from './fixtures';

jest.mock('../src/db', () => ({
  dbConnect: () => Knex({
    client: 'sqlite3',
    connection: ':memory:',
    useNullAsDefault: true,
  })
}));

describe('end-to-end', () => {
  let probot: Probot;
  let db: Database;

  beforeAll(async () => {
    nock.disableNetConnect();
    process.env = {
      DISABLE_WEBHOOK_EVENT_CHECK: 'true',
      GITHUB_ORG: 'test_org',
      GITHUB_ACCESS_TOKEN: '_TOKEN_',
      NODE_ENV: 'test',
    };

    db = dbConnect();
    await setupDb(db);

    probot = new Probot({});
    const probotApp = probot.load(app);
    probotApp.app = {
      getInstallationAccessToken: async () =>'test',
      getSignedJsonWebToken: () => 'test',
    };

  });

  afterAll(() => {
    nock.enableNetConnect();
    db.destroy();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    db('invites').truncate();

    // Fail the test if there were unused nocks.
    if (!nock.isDone()) {
      throw new Error('Not all nock interceptors were used!');
      nock.cleanAll();
    }
  });

  describe('when a comment includes "/invite @someone"', () => {
    describe('when @someone is a member of the org', () => {
      it('comments, doesn\'t record', async done => {
        nock('https://api.github.com')
          .put('/orgs/test_org/memberships/someone')
          .reply(200, getFixture('add_member.exists'))
          .post('/repos/test_org/test_repo/issues/1337/comments', body => {
            expect(body).toEqual({
              body: 'You asked me to invite `@someone`, but they are already' +
                ' a member of `test_org`!'
            });
            return true;
          })
          .reply(200);

        await triggerWebhook(probot, 'trigger_invite.issue_comment.created');
        expect(await db('invites').select().first()).toBeUndefined();
        done();
      });
    });
    
    describe('when @someone is not a member of the org', () => {
      const recordedInvite = {
        username: 'someone',
        repo: 'test_repo',
        issue_number: 1337,
        action: InviteAction.INVITE,
        archived: false,
      };

      it('invites, records, comments', async done => {
        nock('https://api.github.com')
          .put('/orgs/test_org/memberships/someone')
          .reply(200, getFixture('add_member.invited'))
          .post('/repos/test_org/test_repo/issues/1337/comments', body => {
            expect(body).toEqual({
              body: 'An invitation to join `test_org` has been sent to ' +
                '`@someone`. I will update this thread when the invitation ' +
                'accepted'
            });
            return true;
          })
          .reply(200);

        await triggerWebhook(probot, 'trigger_invite.issue_comment.created');
        expect(await db('invites').select().first()).toEqual(recordedInvite);
        done();
      });

      describe('once the invite is accepted', () => {
        beforeEach(async done => {
          await db('invites').insert(recordedInvite);
          done();
        });

        it('comments, archives', async done => {
          nock('https://api.github.com')
            .post('/repos/test_org/test_repo/issues/1337/comments', body => {
              expect(body).toEqual({
                body: 'The invitation to `@someone` was accepted!'
              });
              return true;
            })
            .reply(200);

          await triggerWebhook(probot, 'organization.member_added');
          expect(await db('invites').pluck('archived').first()).toEqual(true);
          done();
        });
      });
    });
  });

  describe('when a comment includes "/tryassign @someone"', () => {
    describe('when @someone is a member of the org', () => {
      it('assigns, comments, doesn\'t record', async done => {
        nock('https://api.github.com')
          .put('/orgs/test_org/memberships/someone')
          .reply(200, getFixture('add_member.exists'))
          .post('/repos/test_org/test_repo/issues/1337/assignees', body => {
            expect(body).toEqual({assignees: ['someone']});
            return true;
          })
          .reply(200)
          .post('/repos/test_org/test_repo/issues/1337/comments', body => {
            expect(body).toEqual({
              body: 'It looks like `@someone` is already a member of ' +
                '`test_org`! I\'ve assigned them to this issue.'
            });
            return true;
          })
          .reply(200);

        await triggerWebhook(probot, 'trigger_tryassign.issue_comment.created');
        expect(await db('invites').select().first()).toBeUndefined();
        done();
      });
    });

    describe('when @someone is not a member of the org', () => {
      const recordedInvite = {
        username: 'someone',
        repo: 'test_repo',
        issue_number: 1337,
        action: InviteAction.INVITE_AND_ASSIGN,
        archived: false,
      };

      it('invites, records, comments', async done => {
        nock('https://api.github.com')
          .put('/orgs/test_org/memberships/someone')
          .reply(200, getFixture('add_member.invited'))
          .post('/repos/test_org/test_repo/issues/1337/comments', body => {
            expect(body).toEqual({
              body: 'An invitation to join `test_org` has been sent to ' +
                '`@someone`. I will update this thread when the invitation ' +
                'accepted'
            });
            return true;
          })
          .reply(200);

        await triggerWebhook(probot, 'trigger_tryassign.issue_comment.created');
        expect(await db('invites').select().first()).toEqual(recordedInvite);
        done();
      });

      describe('once the invite is accepted', () => {
        beforeEach(async done => {
          await db('invites').insert(recordedInvite);
          done();
        });

        it('assigns, comments, archives', async done => {
          nock('https://api.github.com')
            .post('/repos/test_org/test_repo/issues/1337/assignees', body => {
              expect(body).toEqual({assignees: ['someone']});
              return true;
            })
            .reply(200)
            .post('/repos/test_org/test_repo/issues/1337/comments', body => {
              expect(body).toEqual({
                body: 'The invitation to `@someone` was accepted!'
              });
              return true;
            })
            .reply(200);

          await triggerWebhook(probot, 'organization.member_added');
          expect(await db('invites').pluck('archived').first()).toEqual(true);
          done();
        });
      });
    });
  });

  describe('when a comment includes no macros', () => {
    it('ignores it', async done => {
      await triggerWebhook(probot, 'issue_comment.created');
      expect(await db('invites').select().first()).toBeUndefined();
      done();
    });
  });

  describe('when someone joins without a recorded invitation', () => {
    it('ignores it', async done => {
      await triggerWebhook(probot, 'organization.member_added');
      expect(await db('invites').select().first()).toBeUndefined();
      done();
    });
  })
});
