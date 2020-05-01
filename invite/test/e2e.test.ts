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

import {Probot} from 'probot';
import Knex from 'knex';
import nock from 'nock';

import {Database, dbConnect} from '../src/db';
import {InvitationRecord, InviteAction} from '../src/invitation_record';
import {InviteBot} from '../src/invite_bot';
import {getFixture, triggerWebhook} from './fixtures';
import {setupDb} from '../src/setup_db';
import app from '../app';

jest.mock('../src/db', () => {
  const testDb = Knex({
    client: 'sqlite3',
    connection: ':memory:',
    useNullAsDefault: true,
  });

  return {
    Database: Knex,
    dbConnect: (): Knex => testDb,
  };
});

describe('end-to-end', () => {
  let probot: Probot;
  let db: Database;
  let record: InvitationRecord;

  beforeAll(async () => {
    nock.disableNetConnect();
    process.env = {
      DISABLE_WEBHOOK_EVENT_CHECK: 'true',
      GITHUB_ORG: 'test_org',
      ALLOW_TEAM_SLUG: 'test_org/wg-inviters',
      GITHUB_ACCESS_TOKEN: '_TOKEN_',
      NODE_ENV: 'test',
    };

    db = dbConnect();
    await setupDb(db);
    record = new InvitationRecord(db);

    probot = new Probot({});
    const probotApp = probot.load(app);
    probotApp.app = {
      getInstallationAccessToken: async (): Promise<string> => 'test',
      getSignedJsonWebToken: (): string => 'test',
    };
  });

  afterAll(async () => {
    nock.enableNetConnect();
    await db.destroy();
  });

  beforeEach(() => nock.cleanAll());

  afterEach(async () => {
    jest.restoreAllMocks();
    await db('invites').truncate();

    // Fail the test if there were unused nocks.
    if (!nock.isDone()) {
      throw new Error('Not all nock interceptors were used!');
    }
  });

  describe('when a comment includes "/invite @someone"', () => {
    describe('when @someone is a member of the org', () => {
      it("comments, doesn't record", async done => {
        nock('https://api.github.com')
          .get('/orgs/test_org/teams/wg-inviters/memberships/author')
          .reply(200, getFixture('team_membership.active'))
          .put('/orgs/test_org/memberships/someone')
          .reply(200, getFixture('add_member.exists'))
          .post('/repos/test_org/test_repo/issues/1337/comments', body => {
            expect(body).toEqual({
              body:
                'You asked me to invite `@someone`, but they are already' +
                ' a member of `test_org`!',
            });
            return true;
          })
          .reply(200);

        await triggerWebhook(probot, 'trigger_invite.issue_comment.created');
        expect(record.getInvites('someone')).resolves.toEqual([]);
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
          .get('/orgs/test_org/teams/wg-inviters/memberships/author')
          .reply(200, getFixture('team_membership.active'))
          .put('/orgs/test_org/memberships/someone')
          .reply(200, getFixture('add_member.invited'))
          .post('/repos/test_org/test_repo/issues/1337/comments', body => {
            expect(body).toEqual({
              body:
                'An invitation to join `test_org` has been sent to ' +
                '`@someone`. I will update this thread when the invitation ' +
                'is accepted.',
            });
            return true;
          })
          .reply(200);

        await triggerWebhook(probot, 'trigger_invite.issue_comment.created');
        expect(record.getInvites('someone')).resolves.toEqual([
          expect.objectContaining(recordedInvite),
        ]);
        done();
      });

      describe('once the invite is accepted', () => {
        beforeEach(async () => record.recordInvite(recordedInvite));

        it('comments, archives', async done => {
          nock('https://api.github.com')
            .post('/repos/test_org/test_repo/issues/1337/comments', body => {
              expect(body).toEqual({
                body: 'The invitation to `@someone` was accepted!',
              });
              return true;
            })
            .reply(200);

          await triggerWebhook(probot, 'organization.member_added');
          expect(record.getInvites('someone')).resolves.toEqual([]);
          done();
        });
      });
    });
  });

  describe('when a comment includes "/tryassign @someone"', () => {
    describe('when @someone is a member of the org', () => {
      it("assigns, comments, doesn't record", async done => {
        nock('https://api.github.com')
          .get('/orgs/test_org/teams/wg-inviters/memberships/author')
          .reply(200, getFixture('team_membership.active'))
          .put('/orgs/test_org/memberships/someone')
          .reply(200, getFixture('add_member.exists'))
          .post('/repos/test_org/test_repo/issues/1337/assignees', body => {
            expect(body).toEqual({assignees: ['someone']});
            return true;
          })
          .reply(200)
          .post('/repos/test_org/test_repo/issues/1337/comments', body => {
            expect(body).toEqual({
              body: "I've assigned this issue to `@someone`.",
            });
            return true;
          })
          .reply(200);

        await triggerWebhook(probot, 'trigger_tryassign.issue_comment.created');
        expect(record.getInvites('someone')).resolves.toEqual([]);
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
          .get('/orgs/test_org/teams/wg-inviters/memberships/author')
          .reply(200, getFixture('team_membership.active'))
          .put('/orgs/test_org/memberships/someone')
          .reply(200, getFixture('add_member.invited'))
          .post('/repos/test_org/test_repo/issues/1337/comments', body => {
            expect(body).toEqual({
              body:
                'An invitation to join `test_org` has been sent to ' +
                '`@someone`. I will update this thread when the invitation ' +
                'is accepted.',
            });
            return true;
          })
          .reply(200);

        await triggerWebhook(probot, 'trigger_tryassign.issue_comment.created');
        expect(record.getInvites('someone')).resolves.toEqual([
          expect.objectContaining(recordedInvite),
        ]);
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
                body:
                  "The invitation to `@someone` was accepted! I've " +
                  'assigned them to this issue.',
              });
              return true;
            })
            .reply(200);

          await triggerWebhook(probot, 'organization.member_added');
          expect(record.getInvites('someone')).resolves.toEqual([]);
          done();
        });
      });
    });
  });

  describe('when a comment includes no macros', () => {
    it('ignores it', async done => {
      jest.spyOn(InviteBot.prototype, 'tryInvite');
      await triggerWebhook(probot, 'issue_comment.created');

      expect(InviteBot.prototype.tryInvite).not.toBeCalled();
      // The test will fail if any unexpected network requests occur.
      done();
    });
  });

  describe('when the author is not a member of the allow team', () => {
    it('ignores it', async done => {
      jest.spyOn(InviteBot.prototype, 'tryInvite');
      nock('https://api.github.com')
        .get('/orgs/test_org/teams/wg-inviters/memberships/author')
        .reply(404, getFixture('team_membership.not_found'));
      await triggerWebhook(probot, 'trigger_invite.issue_comment.created');

      expect(InviteBot.prototype.tryInvite).not.toBeCalled();
      // The test will fail if any unexpected network requests occur.
      done();
    });
  });

  describe('when someone joins without a recorded invitation', () => {
    it('ignores it', async done => {
      await triggerWebhook(probot, 'organization.member_added');

      // The test will fail if any unexpected network requests occur.
      done();
    });
  });
});
