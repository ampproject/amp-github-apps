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
import knex, {Knex} from 'knex';

import {Database, dbConnect} from '../src/db';
import {GitHub} from '../src/github';
import {InvitationRecord, InviteAction} from '../src/invitation_record';
import {setupDb} from '../src/setup_db';
import {triggerWebhook} from './fixtures';
import app from '../app';

jest.mock('../src/db', () => {
  const testDb = knex({
    client: 'sqlite3',
    connection: ':memory:',
    useNullAsDefault: true,
  });

  return {
    Database: Knex,
    dbConnect: (): Knex => testDb,
  };
});

jest.mock('../src/github');
const mockGithub = GitHub.prototype as jest.Mocked<GitHub>;

describe('end-to-end', () => {
  let probot: Probot;
  let db: Database;
  let record: InvitationRecord;

  beforeAll(async () => {
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

    probot = new Probot({appId: 1, githubToken: 'test'});
    probot.load(app);
  });

  afterAll(async () => {
    await db.destroy();
  });

  afterEach(async () => {
    jest.resetAllMocks();
    await db('invites').truncate();
  });

  describe('when a comment includes "/invite @someone"', () => {
    describe('when @someone is a member of the org', () => {
      it("comments, doesn't record", async () => {
        mockGithub.userIsTeamMember.mockResolvedValue(true);
        mockGithub.inviteUser.mockResolvedValue(false);
        mockGithub.addComment.mockResolvedValue();

        await triggerWebhook(probot, 'trigger_invite.issue_comment.created');
        await expect(record.getInvites('someone')).resolves.toEqual([]);

        expect(mockGithub.userIsTeamMember).toHaveBeenCalledWith(
          'author',
          'test_org/wg-inviters'
        );
        expect(mockGithub.inviteUser).toHaveBeenCalledWith('someone');
        expect(mockGithub.addComment).toHaveBeenCalledWith(
          'test_repo',
          1337,
          expect.stringContaining('already a member of `test_org`')
        );
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

      it('invites, records, comments', async () => {
        mockGithub.userIsTeamMember.mockResolvedValue(true);
        mockGithub.inviteUser.mockResolvedValue(true);
        mockGithub.addComment.mockResolvedValue();

        await triggerWebhook(probot, 'trigger_invite.issue_comment.created');
        await expect(record.getInvites('someone')).resolves.toEqual([
          expect.objectContaining(recordedInvite),
        ]);

        expect(mockGithub.userIsTeamMember).toHaveBeenCalledWith(
          'author',
          'test_org/wg-inviters'
        );
        expect(mockGithub.inviteUser).toHaveBeenCalledWith('someone');
        expect(mockGithub.addComment).toHaveBeenCalledWith(
          'test_repo',
          1337,
          expect.stringContaining(
            'An invitation to join `test_org` has been sent to `@someone`'
          )
        );
      });

      describe('once the invite is accepted', () => {
        beforeEach(async () => record.recordInvite(recordedInvite));

        it('comments, archives', async () => {
          mockGithub.addComment.mockResolvedValue();

          await triggerWebhook(probot, 'organization.member_added');
          await expect(record.getInvites('someone')).resolves.toEqual([]);

          expect(mockGithub.addComment).toHaveBeenCalledWith(
            'test_repo',
            1337,
            'The invitation to `@someone` was accepted!'
          );
        });
      });
    });
  });

  describe('when a comment includes "/tryassign @someone"', () => {
    describe('when @someone is a member of the org', () => {
      it("assigns, comments, doesn't record", async () => {
        mockGithub.userIsTeamMember.mockResolvedValue(true);
        mockGithub.inviteUser.mockResolvedValue(false);
        mockGithub.assignIssue.mockResolvedValue();
        mockGithub.addComment.mockResolvedValue();

        await triggerWebhook(probot, 'trigger_tryassign.issue_comment.created');
        await expect(record.getInvites('someone')).resolves.toEqual([]);

        expect(mockGithub.userIsTeamMember).toHaveBeenCalledWith(
          'author',
          'test_org/wg-inviters'
        );
        expect(mockGithub.inviteUser).toHaveBeenCalledWith('someone');
        expect(mockGithub.assignIssue).toHaveBeenCalledWith(
          'test_repo',
          1337,
          'someone'
        );
        expect(mockGithub.addComment).toHaveBeenCalledWith(
          'test_repo',
          1337,
          expect.stringContaining('assigned this issue to `@someone`')
        );
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

      it('invites, records, comments', async () => {
        mockGithub.userIsTeamMember.mockResolvedValue(true);
        mockGithub.inviteUser.mockResolvedValue(true);
        mockGithub.assignIssue.mockResolvedValue();
        mockGithub.addComment.mockResolvedValue();

        await triggerWebhook(probot, 'trigger_tryassign.issue_comment.created');
        await expect(record.getInvites('someone')).resolves.toEqual([
          expect.objectContaining(recordedInvite),
        ]);

        expect(mockGithub.addComment).toHaveBeenCalledWith(
          'test_repo',
          1337,
          expect.stringContaining(
            'An invitation to join `test_org` has been sent to `@someone`'
          )
        );
      });

      describe('once the invite is accepted', () => {
        beforeEach(async () => {
          await db('invites').insert(recordedInvite);
        });

        it('assigns, comments, archives', async () => {
          await triggerWebhook(probot, 'organization.member_added');
          await expect(record.getInvites('someone')).resolves.toEqual([]);

          expect(mockGithub.assignIssue).toHaveBeenCalledWith(
            'test_repo',
            1337,
            'someone'
          );
          expect(mockGithub.addComment).toHaveBeenCalledWith(
            'test_repo',
            1337,
            expect.stringContaining(
              'The invitation to `@someone` was accepted!'
            )
          );
        });
      });
    });
  });

  describe('when a comment includes no macros', () => {
    it('ignores it', async () => {
      await triggerWebhook(probot, 'issue_comment.created');

      expect(mockGithub.userIsTeamMember).not.toHaveBeenCalled();
      expect(mockGithub.inviteUser).not.toHaveBeenCalled();
      expect(mockGithub.assignIssue).not.toHaveBeenCalled();
      expect(mockGithub.addComment).not.toHaveBeenCalled();
    });
  });

  describe('when the author is not a member of the allow team', () => {
    it('ignores it', async () => {
      mockGithub.userIsTeamMember.mockResolvedValue(false);

      await triggerWebhook(probot, 'trigger_invite.issue_comment.created');

      expect(mockGithub.userIsTeamMember).toHaveBeenCalledWith(
        'author',
        'test_org/wg-inviters'
      );
      expect(mockGithub.inviteUser).not.toHaveBeenCalled();
      expect(mockGithub.assignIssue).not.toHaveBeenCalled();
      expect(mockGithub.addComment).not.toHaveBeenCalled();
    });
  });

  describe('when someone joins without a recorded invitation', () => {
    it('ignores it', async () => {
      await triggerWebhook(probot, 'organization.member_added');

      expect(mockGithub.userIsTeamMember).not.toHaveBeenCalled();
      expect(mockGithub.inviteUser).not.toHaveBeenCalled();
      expect(mockGithub.assignIssue).not.toHaveBeenCalled();
      expect(mockGithub.addComment).not.toHaveBeenCalled();
    });
  });
});
