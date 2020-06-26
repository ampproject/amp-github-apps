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

import {mocked} from 'ts-jest/utils';
import Knex from 'knex';

import {GitHub} from '../src/github';
import {InvitationRecord, InviteAction} from '../src/invitation_record';
import {Invite} from 'invite-bot';
import {InviteBot} from '../src/invite_bot';
import {dbConnect} from '../src/db';
import {setupDb} from '../src/setup_db';

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

function _daysAgo(days: number): Date {
  return new Date(Number(new Date()) - days * 24 * 60 * 60 * 1000);
}

describe('Invite Bot', () => {
  let inviteBot: InviteBot;
  const db = dbConnect();

  beforeAll(async () => setupDb(db));
  afterAll(async () => db.destroy());

  beforeEach(() => {
    jest.spyOn(GitHub.prototype, 'inviteUser');
    jest.spyOn(GitHub.prototype, 'addComment').mockImplementation(async () => {
      // Do nothing
    });
    jest.spyOn(GitHub.prototype, 'assignIssue').mockImplementation(async () => {
      // Do nothing
    });
    jest.spyOn(InvitationRecord.prototype, 'recordInvite');

    inviteBot = new InviteBot(
      /*client=*/ null,
      'test_org',
      'test_org/wg-example',
      /*helpUsernameToTag=*/ 'test_org/wg-helpme'
    );
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await db('invites').truncate();
  });

  describe('constructor', () => {
    it('defaults helpUserTag to "someone"', () => {
      inviteBot = new InviteBot(/*client=*/ null, 'test_org', 'wg-example');
      expect(inviteBot.helpUserTag).toEqual('someone in your organization');
    });

    it('prepends the help username with @ if set', () => {
      inviteBot = new InviteBot(
        /*client=*/ null,
        'test_org',
        'wg-example',
        /*helpUsernameToTag=*/ 'test_org/wg-helpme'
      );
      expect(inviteBot.helpUserTag).toEqual('@test_org/wg-helpme');
    });
  });

  describe('processComment', () => {
    beforeEach(() => {
      jest.spyOn(GitHub.prototype, 'userIsTeamMember');
      jest.spyOn(inviteBot, 'userCanTrigger');
      jest.spyOn(inviteBot, 'parseMacros');
      jest.spyOn(inviteBot, 'tryInvite');
      jest.spyOn(inviteBot, 'tryAssign').mockImplementation(async () => {
        // Do nothing
      });
    });

    it('ignores empty comments', async done => {
      await inviteBot.processComment('test_repo', 1337, null, 'author');

      expect(inviteBot.parseMacros).not.toBeCalled();
      done();
    });

    it('parses the comment for macros', async done => {
      await inviteBot.processComment('test_repo', 1337, 'My comment', 'author');

      expect(inviteBot.parseMacros).toBeCalledWith('My comment');
      done();
    });

    describe('when macros are present', () => {
      const comment = '/invite @someone and /tryassign @someoneelse';

      beforeEach(() => {
        mocked(inviteBot.tryInvite).mockClear();
        mocked(GitHub.prototype.inviteUser).mockImplementation(
          async () => false
        );
        mocked(GitHub.prototype.userIsTeamMember).mockImplementation(
          async (username: string) => username === 'member-author'
        );
      });

      describe('if the comment author is not allowed to trigger', () => {
        const author = 'nonmember-author';

        it('does not try to send invites', async done => {
          await inviteBot.processComment('test_repo', 1337, comment, author);

          expect(inviteBot.tryInvite).not.toBeCalled();
          done();
        });
      });

      describe('if the comment author is allowed to trigger', () => {
        const author = 'member-author';

        it('tries to send invites', async done => {
          await inviteBot.processComment('test_repo', 1337, comment, author);

          expect(inviteBot.tryInvite).toBeCalledWith({
            username: 'someone',
            repo: 'test_repo',
            issue_number: 1337,
            action: InviteAction.INVITE,
          });
          expect(inviteBot.tryInvite).toBeCalledWith({
            username: 'someoneelse',
            repo: 'test_repo',
            issue_number: 1337,
            action: InviteAction.INVITE_AND_ASSIGN,
          });
          done();
        });

        describe('for /tryassign macros', () => {
          it('tries to assign the issue', async done => {
            await inviteBot.processComment('test_repo', 1337, comment, author);

            expect(inviteBot.tryAssign).toBeCalledWith(
              {
                username: 'someoneelse',
                repo: 'test_repo',
                issue_number: 1337,
                action: InviteAction.INVITE_AND_ASSIGN,
              },
              /*accepted=*/ false
            );

            done();
          });
        });
      });
    });

    describe('when no macros are found', () => {
      const comment = 'say hello/invite @someone and do not /tryassign anyone';

      it('does not try to check if the user can trigger', async done => {
        await inviteBot.processComment('test_repo', 1337, comment, 'author');

        expect(inviteBot.userCanTrigger).not.toBeCalled();
        done();
      });

      it('does not try to send any invites', async done => {
        await inviteBot.processComment('test_repo', 1337, comment, 'author');

        expect(inviteBot.tryInvite).not.toBeCalled();
        done();
      });
    });
  });

  describe('processAcceptedInvite', () => {
    beforeEach(() => {
      jest
        .spyOn(GitHub.prototype, 'addComment')
        .mockImplementation(async () => {
          //Do nothing
        });
      jest.spyOn(inviteBot, 'tryAssign').mockImplementation(async () => {
        // Do nothing
      });
    });

    it('checks the record for invites to the user', async done => {
      jest.spyOn(inviteBot.record, 'getInvites');
      await inviteBot.processAcceptedInvite('someone');

      expect(inviteBot.record.getInvites).toBeCalledWith('someone');
      done();
    });

    describe('when there are recorded invites', () => {
      describe('with Invite action', () => {
        beforeEach(async done => {
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

          done();
        });

        it('does not try to assign any issues', async done => {
          await inviteBot.processAcceptedInvite('someone');

          expect(inviteBot.tryAssign).not.toBeCalled();
          done();
        });

        it('comments on the issues that the invite was accepted', async done => {
          await inviteBot.processAcceptedInvite('someone');

          expect(inviteBot.github.addComment).toBeCalledWith(
            'test_repo',
            1337,
            `The invitation to \`@someone\` was accepted!`
          );

          expect(inviteBot.github.addComment).toBeCalledWith(
            'test_repo',
            42,
            `The invitation to \`@someone\` was accepted!`
          );
          done();
        });
      });

      describe('with InviteAndAssign action', () => {
        beforeEach(async done => {
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

          done();
        });

        it('tries to assign the issues', async done => {
          await inviteBot.processAcceptedInvite('someone');

          expect(inviteBot.tryAssign).toBeCalledWith(
            expect.objectContaining({
              username: 'someone',
              repo: 'test_repo',
              issue_number: 1337,
              action: InviteAction.INVITE_AND_ASSIGN,
            }),
            /*accepted=*/ true
          );
          expect(inviteBot.tryAssign).toBeCalledWith(
            expect.objectContaining({
              username: 'someone',
              repo: 'test_repo',
              issue_number: 42,
              action: InviteAction.INVITE_AND_ASSIGN,
            }),
            /*accepted=*/ true
          );

          done();
        });
      });
    });

    describe('when there are no recorded invites to the user', () => {
      it('does not try to assign any issues', async done => {
        await inviteBot.processAcceptedInvite('someone');

        expect(inviteBot.tryAssign).not.toBeCalled();
        done();
      });
      it('does not comment on any issues', async done => {
        inviteBot.processAcceptedInvite('someone');

        expect(inviteBot.github.addComment).not.toBeCalled();
        done();
      });
    });
  });

  describe('userCanTrigger', () => {
    beforeEach(() => {
      const members = ['a-member'];
      jest
        .spyOn(GitHub.prototype, 'userIsTeamMember')
        .mockImplementation(async (username: string) =>
          members.includes(username)
        );
    });

    it('returns true if user is a member of allow team', async done => {
      expect(inviteBot.userCanTrigger('a-member')).resolves.toBe(true);
      done();
    });

    it('returns false if user is not a member of allow team', async done => {
      expect(inviteBot.userCanTrigger('not-a-member')).resolves.toBe(false);
      done();
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
        mocked(GitHub.prototype.inviteUser).mockImplementation(
          async () => false
        );
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
        });

        it('retries inviting the user', async done => {
          await inviteBot.tryInvite({
            username: 'oldInvitee',
            repo: 'test_repo',
            issue_number: 1337,
            action: InviteAction.INVITE,
          });
          expect(inviteBot.github.inviteUser).toBeCalledWith('oldInvitee');
          done();
        });
      });

      it('it does not attempt to send an invite', async done => {
        await inviteBot.tryInvite(newInvite);
        expect(inviteBot.github.inviteUser).not.toBeCalled();
        done();
      });

      it('records the requested invite', async done => {
        await inviteBot.tryInvite(newInvite);
        expect(inviteBot.record.recordInvite).toBeCalledWith(newInvite);
        done();
      });

      it('comments that there is already an invite pending', async done => {
        await inviteBot.tryInvite(newInvite);
        expect(inviteBot.github.addComment).toBeCalledWith(
          'test_repo',
          1337,
          'You asked me to invite `@someone` to `test_org`, but they already ' +
            'have an invitation pending! I will update this thread when the ' +
            'invitation is accepted.'
        );
        done();
      });
    });

    describe('when the user is a member', () => {
      beforeEach(() => {
        mocked(GitHub.prototype.inviteUser).mockImplementation(
          async () => false
        );
      });

      it('attempts to send an invite', async done => {
        await inviteBot.tryInvite(newInvite);
        expect(inviteBot.github.inviteUser).toBeCalledWith('someone');
        done();
      });

      it('does not record the requested invite', async done => {
        await inviteBot.tryInvite(newInvite);
        expect(inviteBot.record.recordInvite).not.toBeCalled();
        done();
      });

      it('comments that the user is already a member', async done => {
        await inviteBot.tryInvite(newInvite);
        expect(inviteBot.github.addComment).toBeCalledWith(
          'test_repo',
          1337,
          'You asked me to invite `@someone`, but they are already a member ' +
            'of `test_org`!'
        );
        done();
      });
    });

    describe('when the user is not a member', () => {
      beforeEach(() => {
        mocked(GitHub.prototype.inviteUser).mockImplementation(
          async () => true
        );
      });

      it('attempts to send an invite', async done => {
        await inviteBot.tryInvite(newInvite);
        expect(inviteBot.github.inviteUser).toBeCalledWith('someone');
        done();
      });

      it('records the requested invite', async done => {
        await inviteBot.tryInvite(newInvite);
        expect(inviteBot.record.recordInvite).toBeCalledWith(newInvite);
        done();
      });

      it('comments that the user was invited', async done => {
        await inviteBot.tryInvite(newInvite);
        expect(inviteBot.github.addComment).toBeCalledWith(
          'test_repo',
          1337,
          'An invitation to join `test_org` has been sent to `@someone`. I ' +
            'will update this thread when the invitation is accepted.'
        );
        done();
      });
    });

    describe('when the invite fails', () => {
      beforeEach(() => {
        mocked(GitHub.prototype.inviteUser).mockRejectedValue(
          new Error('Uh-oh!')
        );
        jest.spyOn(console, 'error').mockImplementation(() => {
          // Do nothing
        });
      });

      it('logs an error', async done => {
        try {
          await inviteBot.tryInvite(newInvite);
        } catch (e) {}

        expect(console.error).toBeCalledWith(
          'Failed to send an invite to `@someone`: Error: Uh-oh!'
        );
        done();
      });

      it('comments about the error', async done => {
        try {
          await inviteBot.tryInvite(newInvite);
        } catch (e) {}

        expect(inviteBot.github.addComment).toBeCalledWith(
          'test_repo',
          1337,
          'You asked me to send an invite to `@someone`, but I ran into an ' +
            'error when I tried. You can try sending the invite manually, or ' +
            'ask @test_org/wg-helpme for help.'
        );
        done();
      });

      it('re-throws the error', async done => {
        expect.assertions(1);
        try {
          await inviteBot.tryInvite(newInvite);
        } catch (e) {
          expect(e).toEqual(new Error('Uh-oh!'));
        }
        done();
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

    it('assigns the user to the issue', async done => {
      await inviteBot.tryAssign(newInvite, true);
      expect(inviteBot.github.assignIssue).toBeCalledWith(
        'test_repo',
        1337,
        'someone'
      );
      done();
    });

    describe('when @someone just accepted the invitation', () => {
      it('comments that the issue was assigned', async done => {
        await inviteBot.tryAssign(newInvite, true);
        expect(inviteBot.github.addComment).toBeCalledWith(
          'test_repo',
          1337,
          "The invitation to `@someone` was accepted! I've assigned them to " +
            'this issue.'
        );
        done();
      });
    });

    describe('when @someone was already a member of the org', () => {
      it('comments that the issue was assigned', async done => {
        await inviteBot.tryAssign(newInvite, false);
        expect(inviteBot.github.addComment).toBeCalledWith(
          'test_repo',
          1337,
          "I've assigned this issue to `@someone`."
        );
        done();
      });
    });
  });
});
