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

import {Invite, InviteAction} from '../src/types';
import {InvitationRecord} from '../src/invitation_record';
import {InviteBot} from '../src/invite_bot';
import {GitHub} from '../src/github';

describe('Invite Bot', () => {
  let inviteBot: InviteBot;

  beforeEach(() => {
    inviteBot = new InviteBot(/*client=*/ null, 'test_repo');

    jest.spyOn(GitHub.prototype, 'inviteUser');
    jest.spyOn(GitHub.prototype, 'addComment');
    jest.spyOn(InvitationRecord.prototype, 'recordInvite');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('parseMacros', () => {
    describe('comments without macros', () => {
      it('returns an empty list', () => {
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
        const comment = '/invite @someone and /invite @someone_else';
        expect(inviteBot.parseMacros(comment)).toEqual({
          someone: InviteAction.INVITE,
          someone_else: InviteAction.INVITE,
        });
      });
    });

    describe('comments with `/tryassign @user`', () => {
      it('returns list including InviteAndAssign action for @user', () => {
        const comment = '/tryassign @someone';
        expect(inviteBot.parseMacros(comment)).toEqual([
          {
            someone: InviteAction.INVITE_AND_ASSIGN,
          },
        ]);
      });

      it('handles multiple `/tryassign` macros', () => {
        const comment = '/tryassign @someone and /tryAssign @someone_else';
        expect(inviteBot.parseMacros(comment)).toEqual([
          {
            someone: InviteAction.INVITE_AND_ASSIGN,
            someone_else: InviteAction.INVITE_AND_ASSIGN,
          },
        ]);
      });
    });

    it('handles mix of `/invite` and `/tryassign` macros', () => {
      const comment = '/invite @someone and /tryAssign @someone_else';
      expect(inviteBot.parseMacros(comment)).toEqual([
        {
          someone: InviteAction.INVITE,
          someone_else: InviteAction.INVITE_AND_ASSIGN,
        },
      ]);
    });

    it('ignores `whatever/invite` and `something/tryassign` non-macros', () => {
      const comment = 'greet/invite @someone and ask/tryAssign @someone_else';
      expect(inviteBot.parseMacros(comment)).toEqual([]);
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
        inviteBot.record.recordInvite({
          username: 'someone',
          repo: 'test_repo',
          issue_number: 42,
          action: InviteAction.INVITE,
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
          'I attempted to invite @someone to `test_org`, but they already ' +
            'have an invitation pending! I will update this thread when the ' +
            'invitation is accepted.'
        );
        done();
      });
    });

    describe('when the user is a member', () => {
      beforeEach(() => {
        mocked(inviteBot.github.inviteUser).mockImplementation(
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
          'You asked me to invite @someone, but they are already a member of ' +
            '`test_org/test_repo`!'
        );
        done();
      });

      it('returns false', async done => {
        expect(await inviteBot.tryInvite(newInvite)).toBe(false);
        done();
      });
    });

    describe('when the user is not a member', () => {
      beforeEach(() => {
        mocked(inviteBot.github.inviteUser).mockImplementation(
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
          'An invitation to join `test_org` has been sent to @someone. I ' +
            'will update this thread when the invitation is accepted.'
        );
        done();
      });

      it('returns true', async done => {
        expect(await inviteBot.tryInvite(newInvite)).toBe(true);
        done();
      });
    });

    describe('when the invite fails', () => {
      beforeEach(() => {
        mocked(inviteBot.github.inviteUser).mockImplementation(async () => {
          throw new Error('Uh-oh!');
        });
        jest.spyOn(console, 'error');
      });

      it('logs an error', async done => {
        try {
          await inviteBot.tryInvite(newInvite);
        } catch (e) {}

        expect(console.error).toBeCalledWith(
          'Failed to send an invite to @someone: Error: Uh-oh!'
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
          'You asked me to send an invite to @someone, but I ran into an ' +
            'error when I tried. Try sending the invite manually.'
        );
        done();
      });

      it('re-throws the error', async done => {
        expect(async () => {
          await inviteBot.tryInvite(newInvite);
        }).toThrow(new Error('Uh-oh!'));
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
          "The invitation to @someone was accepted! I've assigned them to " +
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
          "It looks like @someone is already a member of `test_org`! I've " +
            'assigned them to this issue.'
        );
        done();
      });
    });
  });
});
