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

import knex, {Knex} from 'knex';

import {GitHub} from '../src/github';
import {InvitationRecord, InviteAction} from '../src/invitation_record';
import {Invite} from 'invite-bot';
import {InviteBot} from '../src/invite_bot';
import {Octokit} from '@octokit/rest';
import {dbConnect} from '../src/db';
import {setupDb} from '../src/setup_db';

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

function _daysAgo(days: number): Date {
  const d = new Date();
  d.setSeconds(d.getSeconds() - days * 24 * 60 * 60);
  return d;
}

describe('Invite Bot', () => {
  let inviteBot: InviteBot;
  const db = dbConnect();

  beforeAll(async () => setupDb(db));
  afterAll(async () => db.destroy());

  beforeEach(() => {
    jest.spyOn(InvitationRecord.prototype, 'recordInvite');

    inviteBot = new InviteBot(
      /*client=*/ {} as Octokit,
      'test_org',
      'test_org/wg-example',
      /*helpUsernameToTag=*/ 'test_org/wg-helpme'
    );
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    jest.resetAllMocks();
    await db('invites').truncate();
  });

  describe('constructor', () => {
    it('defaults helpUserTag to "someone"', () => {
      inviteBot = new InviteBot(
        /*client=*/ {} as Octokit,
        'test_org',
        'wg-example'
      );
      expect(inviteBot.helpUserTag).toEqual('someone in your organization');
    });

    it('prepends the help username with @ if set', () => {
      inviteBot = new InviteBot(
        /*client=*/ {} as Octokit,
        'test_org',
        'wg-example',
        /*helpUsernameToTag=*/ 'test_org/wg-helpme'
      );
      expect(inviteBot.helpUserTag).toEqual('@test_org/wg-helpme');
    });
  });

  describe('processComment', () => {
    beforeEach(() => {
      jest.spyOn(inviteBot, 'userCanTrigger');
      jest.spyOn(inviteBot, 'parseMacros');
      jest.spyOn(inviteBot, 'tryInvite');
      jest.spyOn(inviteBot, 'tryAssign').mockImplementation(async () => {
        // Do nothing
      });
    });

    it('ignores empty comments', async () => {
      await inviteBot.processComment('test_repo', 1337, '', 'author');

      expect(inviteBot.parseMacros).not.toBeCalled();
    });

    it('parses the comment for macros', async () => {
      await inviteBot.processComment('test_repo', 1337, 'My comment', 'author');

      expect(inviteBot.parseMacros).toHaveBeenCalledWith('My comment');
    });

    describe('when macros are present', () => {
      const comment = '/invite @someone and /tryassign @someoneelse';

      beforeEach(() => {
        jest.mocked(inviteBot.tryInvite).mockClear();
        mockGithub.inviteUser.mockImplementation(async () => false);
        mockGithub.userIsTeamMember.mockImplementation(
          async (username: string) => username === 'member-author'
        );
      });

      describe('if the comment author is not allowed to trigger', () => {
        const author = 'nonmember-author';

        it('does not try to send invites', async () => {
          await inviteBot.processComment('test_repo', 1337, comment, author);

          expect(inviteBot.tryInvite).not.toBeCalled();
        });
      });

      describe('if the comment author is allowed to trigger', () => {
        const author = 'member-author';

        it('tries to send invites', async () => {
          await inviteBot.processComment('test_repo', 1337, comment, author);

          expect(inviteBot.tryInvite).toHaveBeenCalledWith({
            username: 'someone',
            repo: 'test_repo',
            issue_number: 1337,
            action: InviteAction.INVITE,
          });
          expect(inviteBot.tryInvite).toHaveBeenCalledWith({
            username: 'someoneelse',
            repo: 'test_repo',
            issue_number: 1337,
            action: InviteAction.INVITE_AND_ASSIGN,
          });
        });

        describe('for /tryassign macros', () => {
          it('tries to assign the issue', async () => {
            await inviteBot.processComment('test_repo', 1337, comment, author);

            expect(inviteBot.tryAssign).toHaveBeenCalledWith(
              {
                username: 'someoneelse',
                repo: 'test_repo',
                issue_number: 1337,
                action: InviteAction.INVITE_AND_ASSIGN,
              },
              /*accepted=*/ false
            );
          });
        });
      });
    });

    describe('when no macros are found', () => {
      const comment = 'say hello/invite @someone and do not /tryassign anyone';

      it('does not try to check if the user can trigger', async () => {
        await inviteBot.processComment('test_repo', 1337, comment, 'author');

        expect(inviteBot.userCanTrigger).not.toBeCalled();
      });

      it('does not try to send any invites', async () => {
        await inviteBot.processComment('test_repo', 1337, comment, 'author');

        expect(inviteBot.tryInvite).not.toBeCalled();
      });
    });
  });

  describe('processAcceptedInvite', () => {
    beforeEach(() => {
      jest.spyOn(inviteBot, 'tryAssign').mockImplementation(async () => {
        // Do nothing
      });
    });

    it('checks the record for invites to the user', async () => {
      jest.spyOn(inviteBot.record, 'getInvites');
      await inviteBot.processAcceptedInvite('someone');

      expect(inviteBot.record.getInvites).toHaveBeenCalledWith('someone');
    });

    describe('when there are recorded invites', () => {
      describe('with Invite action', () => {
        beforeEach(async () => {
          await inviteBot.record.recordInvite({
            username: 'someone',
            repo: 'test_repo',
            issue_number: 1337,
            action: InviteAction.INVITE,
          });
          await inviteBot.record.recordInvite({
            username: 'someone',
            repo: 'test_repo',
            issue_number: 42,
            action: InviteAction.INVITE,
          });
        });

        it('does not try to assign any issues', async () => {
          await inviteBot.processAcceptedInvite('someone');

          expect(inviteBot.tryAssign).not.toBeCalled();
        });

        it('comments on the issues that the invite was accepted', async () => {
          await inviteBot.processAcceptedInvite('someone');

          expect(mockGithub.addComment).toHaveBeenCalledWith(
            'test_repo',
            1337,
            `The invitation to \`@someone\` was accepted!`
          );

          expect(mockGithub.addComment).toHaveBeenCalledWith(
            'test_repo',
            42,
            `The invitation to \`@someone\` was accepted!`
          );
        });
      });

      describe('with InviteAndAssign action', () => {
        beforeEach(async () => {
          await inviteBot.record.recordInvite({
            username: 'someone',
            repo: 'test_repo',
            issue_number: 1337,
            action: InviteAction.INVITE_AND_ASSIGN,
          });
          await inviteBot.record.recordInvite({
            username: 'someone',
            repo: 'test_repo',
            issue_number: 42,
            action: InviteAction.INVITE_AND_ASSIGN,
          });
        });

        it('tries to assign the issues', async () => {
          await inviteBot.processAcceptedInvite('someone');

          expect(inviteBot.tryAssign).toHaveBeenCalledWith(
            expect.objectContaining({
              username: 'someone',
              repo: 'test_repo',
              issue_number: 1337,
              action: InviteAction.INVITE_AND_ASSIGN,
            }),
            /*accepted=*/ true
          );
          expect(inviteBot.tryAssign).toHaveBeenCalledWith(
            expect.objectContaining({
              username: 'someone',
              repo: 'test_repo',
              issue_number: 42,
              action: InviteAction.INVITE_AND_ASSIGN,
            }),
            /*accepted=*/ true
          );
        });
      });
    });

    describe('when there are no recorded invites to the user', () => {
      it('does not try to assign any issues', async () => {
        await inviteBot.processAcceptedInvite('someone');

        expect(inviteBot.tryAssign).not.toBeCalled();
      });
      it('does not comment on any issues', async () => {
        inviteBot.processAcceptedInvite('someone');

        expect(mockGithub.addComment).not.toBeCalled();
      });
    });
  });

  describe('userCanTrigger', () => {
    beforeEach(() => {
      const members = ['a-member'];
      mockGithub.userIsTeamMember.mockImplementation(async (username: string) =>
        members.includes(username)
      );
    });

    it('returns true if user is a member of allow team', async () => {
      await expect(inviteBot.userCanTrigger('a-member')).resolves.toBe(true);
    });

    it('returns false if user is not a member of allow team', async () => {
      await expect(inviteBot.userCanTrigger('not-a-member')).resolves.toBe(
        false
      );
    });
  });

  describe('parseMacros', () => {
    describe('comments without macros', () => {
      it('returns no matches', () => {
        const comment = 'random comment';
        expect(inviteBot.parseMacros(comment)).toEqual({});
      });

      it('ignores macros without usernames', () => {
        const comment = '/invite not_a_tag';
        expect(inviteBot.parseMacros(comment)).toEqual({});
      });
    });

    describe('comments with `/invite @user`', () => {
      it('returns list including Invite action for @user', () => {
        const comment = '/invite @someone';
        expect(inviteBot.parseMacros(comment)).toEqual({
          someone: InviteAction.INVITE,
        });
      });

      it('handles multiple `/invite` macros', () => {
        const comment = '/invite @someone and /invite @someoneelse';
        expect(inviteBot.parseMacros(comment)).toEqual({
          someone: InviteAction.INVITE,
          someoneelse: InviteAction.INVITE,
        });
      });
    });

    describe('comments with `/tryassign @user`', () => {
      it('returns list including InviteAndAssign action for @user', () => {
        const comment = '/tryassign @someone';
        expect(inviteBot.parseMacros(comment)).toEqual({
          someone: InviteAction.INVITE_AND_ASSIGN,
        });
      });

      it('handles multiple `/tryassign` macros', () => {
        const comment = '/tryassign @someone and /tryAssign @someoneelse';
        expect(inviteBot.parseMacros(comment)).toEqual({
          someone: InviteAction.INVITE_AND_ASSIGN,
          someoneelse: InviteAction.INVITE_AND_ASSIGN,
        });
      });
    });

    it('handles mix of `/invite` and `/tryassign` macros', () => {
      const comment = '/invite @someone and /tryAssign @someoneelse';
      expect(inviteBot.parseMacros(comment)).toEqual({
        someone: InviteAction.INVITE,
        someoneelse: InviteAction.INVITE_AND_ASSIGN,
      });
    });

    it('ignores `whatever/invite` and `something/tryassign` non-macros', () => {
      const comment = 'greet/invite @someone and ask/tryAssign @someoneelse';
      expect(inviteBot.parseMacros(comment)).toEqual({});
    });
  });

  describe('tryInvite', () => {
    const newInvite: Invite = {
      username: 'someone',
      repo: 'test_repo',
      issue_number: 1337,
      action: InviteAction.INVITE,
    };

    describe('when the user has a pending invite from the bot', () => {
      beforeEach(() => {
        jest
          .spyOn(InvitationRecord.prototype, 'getInvites')
          .mockImplementation(async () => [
            {
              username: 'someone',
              repo: 'test_repo',
              issue_number: 42,
              action: InviteAction.INVITE,
              created_at: _daysAgo(1),
            },
          ]);
      });

      describe('if it is older than 7 days', () => {
        beforeEach(() => {
          jest
            .spyOn(InvitationRecord.prototype, 'getInvites')
            .mockImplementation(async () => [
              {
                username: 'oldInvitee',
                repo: 'test_repo',
                issue_number: 42,
                action: InviteAction.INVITE,
                created_at: _daysAgo(8),
              },
            ]);
          mockGithub.inviteUser.mockResolvedValue(false);
        });

        it('retries inviting the user', async () => {
          await inviteBot.tryInvite({
            username: 'oldInvitee',
            repo: 'test_repo',
            issue_number: 1337,
            action: InviteAction.INVITE,
          });
          expect(mockGithub.inviteUser).toHaveBeenCalledWith('oldInvitee');
        });
      });

      it('it does not attempt to send an invite', async () => {
        await inviteBot.tryInvite(newInvite);
        expect(mockGithub.inviteUser).not.toBeCalled();
      });

      it('records the requested invite', async () => {
        await inviteBot.tryInvite(newInvite);
        expect(inviteBot.record.recordInvite).toHaveBeenCalledWith(newInvite);
      });

      it('comments that there is already an invite pending', async () => {
        await inviteBot.tryInvite(newInvite);
        expect(mockGithub.addComment).toHaveBeenCalledWith(
          'test_repo',
          1337,
          'You asked me to invite `@someone` to `test_org`, but they already ' +
            'have an invitation pending! They can accept this invitation ' +
            '[here](https://github.com/orgs/test_org/invitation). I will ' +
            'update this thread when the invitation is accepted.'
        );
      });
    });

    describe('when the user is a member', () => {
      beforeEach(() => {
        mockGithub.inviteUser.mockResolvedValue(false);
      });

      it('attempts to send an invite', async () => {
        await inviteBot.tryInvite(newInvite);
        expect(mockGithub.inviteUser).toHaveBeenCalledWith('someone');
      });

      it('does not record the requested invite', async () => {
        await inviteBot.tryInvite(newInvite);
        expect(inviteBot.record.recordInvite).not.toBeCalled();
      });

      it('comments that the user is already a member', async () => {
        await inviteBot.tryInvite(newInvite);
        expect(mockGithub.addComment).toHaveBeenCalledWith(
          'test_repo',
          1337,
          'You asked me to invite `@someone`, but they are already a member ' +
            'of `test_org`!'
        );
      });
    });

    describe('when the user is not a member', () => {
      beforeEach(() => {
        mockGithub.inviteUser.mockResolvedValue(true);
      });

      it('attempts to send an invite', async () => {
        await inviteBot.tryInvite(newInvite);
        expect(mockGithub.inviteUser).toHaveBeenCalledWith('someone');
      });

      it('records the requested invite', async () => {
        await inviteBot.tryInvite(newInvite);
        expect(inviteBot.record.recordInvite).toHaveBeenCalledWith(newInvite);
      });

      it('comments that the user was invited', async () => {
        await inviteBot.tryInvite(newInvite);
        expect(mockGithub.addComment).toHaveBeenCalledWith(
          'test_repo',
          1337,
          'An invitation to join `test_org` has been sent to `@someone`. ' +
            'They can accept this invitation ' +
            '[here](https://github.com/orgs/test_org/invitation). I ' +
            'will update this thread when the invitation is accepted.'
        );
      });
    });

    describe('when the invite fails', () => {
      beforeEach(() => {
        mockGithub.inviteUser.mockRejectedValue(new Error('Uh-oh!'));
        jest.spyOn(console, 'error').mockImplementation(() => {
          // Do nothing
        });
      });

      it('logs an error', async () => {
        try {
          await inviteBot.tryInvite(newInvite);
        } catch (e) {}

        expect(console.error).toHaveBeenCalledWith(
          'Failed to send an invite to `@someone`: Error: Uh-oh!'
        );
      });

      it('comments about the error', async () => {
        try {
          await inviteBot.tryInvite(newInvite);
        } catch (e) {}

        expect(mockGithub.addComment).toHaveBeenCalledWith(
          'test_repo',
          1337,
          'You asked me to send an invite to `@someone`, but I ran into an ' +
            'error when I tried. You can try sending the invite manually, or ' +
            'ask @test_org/wg-helpme for help.'
        );
      });

      it('re-throws the error', async () => {
        expect.assertions(1);
        try {
          await inviteBot.tryInvite(newInvite);
        } catch (e) {
          expect(e).toEqual(new Error('Uh-oh!'));
        }
      });
    });
  });

  describe('tryAssign', () => {
    const newInvite: Invite = {
      username: 'someone',
      repo: 'test_repo',
      issue_number: 1337,
      action: InviteAction.INVITE_AND_ASSIGN,
    };

    it('assigns the user to the issue', async () => {
      await inviteBot.tryAssign(newInvite, true);
      expect(mockGithub.assignIssue).toHaveBeenCalledWith(
        'test_repo',
        1337,
        'someone'
      );
    });

    describe('when @someone just accepted the invitation', () => {
      it('comments that the issue was assigned', async () => {
        await inviteBot.tryAssign(newInvite, true);
        expect(mockGithub.addComment).toHaveBeenCalledWith(
          'test_repo',
          1337,
          "The invitation to `@someone` was accepted! I've assigned them to " +
            'this issue.'
        );
      });
    });

    describe('when @someone was already a member of the org', () => {
      it('comments that the issue was assigned', async () => {
        await inviteBot.tryAssign(newInvite, false);
        expect(mockGithub.addComment).toHaveBeenCalledWith(
          'test_repo',
          1337,
          "I've assigned this issue to `@someone`."
        );
      });
    });
  });
});
