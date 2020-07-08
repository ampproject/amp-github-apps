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

import {Octokit} from '@octokit/rest';

import {GitHub} from './github';
import {InvitationRecord, InviteAction} from './invitation_record';
import {Invite, InviteActionType, Logger} from 'invite-bot';
import {dbConnect} from './db';

const INVITE_MACROS: Record<string, InviteActionType> = {
  invite: InviteAction.INVITE,
  tryassign: InviteAction.INVITE_AND_ASSIGN,
};

// Regex source: https://github.com/shinnn/github-username-regex
const USERNAME_PATTERN = '[a-z\\d](?:[a-z\\d]|-(?=[a-z\\d])){0,38}';
const MACRO_PATTERN = `/(${Object.keys(INVITE_MACROS).join('|')})`;
const FULL_MACRO_REGEX = new RegExp(
  // (?<!\\S) ensures the macro is not preceded by a non-space character.
  `(?<!\\S)${MACRO_PATTERN} @${USERNAME_PATTERN}`,
  'ig'
);
// GitHub expires invitations after one week.
const EXPIRATION_INTERVAL_SEC = 7 * 24 * 60 * 60;

function expirationDate(): Date {
  const d = new Date();
  d.setSeconds(d.getSeconds() - EXPIRATION_INTERVAL_SEC);
  return d;
}

/**
 * GitHub bot which can invite users to an organization and assign issues in
 * response to macro comments.
 */
export class InviteBot {
  readonly helpUserTag: string;
  readonly github: GitHub;
  readonly record: InvitationRecord;

  /**
   * Constructor.
   *
   * The allowTeamSlug parameter restricts the set of users who can trigger an
   * invite to members of a GitHub team. Example: 'ampproject/inviters'
   *
   * Optional helpUsernameToTag parameter allows specifying someone to tag in the
   * event that the invite fails to send for some reason. If left as null, the
   * comment will say "ask someone for help". Example: 'ampproject/wg-infra'
   */
  constructor(
    client: Octokit,
    private org: string,
    private allowTeamSlug: string,
    helpUsernameToTag: string | null = null,
    private logger: Logger = console
  ) {
    this.github = new GitHub(client, org, logger);
    this.record = new InvitationRecord(dbConnect(), logger);
    this.helpUserTag =
      helpUsernameToTag === null
        ? 'someone in your organization'
        : `@${helpUsernameToTag}`;

    this.logger.info(`InviteBot initialized for ${this.org}`);
  }

  /** Process a comment by identifying and acting on any macros present. */
  async processComment(
    repo: string,
    issue_number: number,
    comment: string,
    author: string
  ): Promise<void> {
    this.logger.info(
      `processComment: Processing comment by @${author} on ` +
        `${repo}#${issue_number}`
    );

    if (!comment) {
      this.logger.info('processComment: Comment is empty; skipping');
      return;
    }

    const macroList = Object.entries(this.parseMacros(comment));
    this.logger.debug(`processComment: Found ${macroList.length} macros`);
    if (macroList.length && (await this.userCanTrigger(author))) {
      for (const [username, action] of macroList) {
        await this.tryInvite({username, repo, issue_number, action});
      }
    }
  }

  /** Process an accepted invite by adding comments and assigning issues. */
  async processAcceptedInvite(username: string): Promise<void> {
    this.logger.info(
      `processAcceptedInvite: Processing invite accepted by @${username}`
    );
    const recordedInvites = await this.record.getInvites(username);

    for (const invite of recordedInvites) {
      switch (invite.action) {
        case InviteAction.INVITE:
          await this.github.addComment(
            invite.repo,
            invite.issue_number,
            `The invitation to \`@${invite.username}\` was accepted!`
          );
          break;
        case InviteAction.INVITE_AND_ASSIGN:
          await this.tryAssign(invite, /*accepted=*/ true);
          break;
        default:
          throw new RangeError('Unimplemented action');
      }
    }

    await this.record.archiveInvites(username);
  }

  /** Checks if a user is allowed to trigger an invite macro. */
  async userCanTrigger(username: string): Promise<boolean> {
    return await this.github.userIsTeamMember(username, this.allowTeamSlug);
  }

  /** Parses a comment for invitation macros. */
  parseMacros(comment: string): Record<string, InviteActionType> {
    const macros: Record<string, InviteActionType> = {};
    const matches = comment.match(FULL_MACRO_REGEX);

    if (matches) {
      matches.forEach((macro: string) => {
        const [macroString, username] = macro.substr(1).split(' @');
        macros[username] = INVITE_MACROS[macroString.toLowerCase()];
      });
    }

    return macros;
  }

  /**
   * Attempt to invite the user, record the invite, and comment with an update
   * about the status of the invite.
   *
   * Should be called in response to new comments with the /invite or /tryassign
   * macros.
   */
  async tryInvite(invite: Invite): Promise<void> {
    this.logger.debug(`tryInvite: Trying to invite`, invite);
    const existingInvites = await this.record.getInvites(invite.username);
    const expiration = expirationDate();
    const pendingInvites = existingInvites.filter(
      ({created_at}) => created_at > expiration
    );

    if (pendingInvites.length) {
      return await this.handlePendingInvite(invite);
    }

    // The user has not been invited by the bot yet, so try and send an invite.
    let invited = false;
    try {
      invited = await this.github.inviteUser(invite.username);
    } catch (error) {
      await this.handleErrorSendingInvite(invite, error);
      throw error;
    }

    if (invited) {
      return await this.handleNewInviteSent(invite);
    }

    if (invite.action === InviteAction.INVITE_AND_ASSIGN) {
      await this.tryAssign(invite, /*accepted=*/ false);
    } else {
      await this.handleUserAlreadyMember(invite);
    }
  }

  /** Handle case where there's at least one pending invite already recorded. */
  private async handlePendingInvite(invite: Invite): Promise<void> {
    await this.record.recordInvite(invite);
    await this.github.addComment(
      invite.repo,
      invite.issue_number,
      `You asked me to invite \`@${invite.username}\` to \`${this.org}\`, ` +
        'but they already have an invitation pending! I will update this ' +
        'thread when the invitation is accepted.'
    );
  }

  /** Handle case where the user is already a member. */
  private async handleUserAlreadyMember(invite: Invite): Promise<void> {
    await this.github.addComment(
      invite.repo,
      invite.issue_number,
      `You asked me to invite \`@${invite.username}\`, but they are ` +
        `already a member of \`${this.org}\`!`
    );
  }

  /** Handle case where the invite was actually sent. */
  private async handleNewInviteSent(invite: Invite): Promise<void> {
    await this.record.recordInvite(invite);
    await this.github.addComment(
      invite.repo,
      invite.issue_number,
      `An invitation to join \`${this.org}\` has been sent to ` +
        `\`@${invite.username}\`. I will update this thread when the ` +
        'invitation is accepted.'
    );
  }

  /** Handle case where the there was an error sending the invite. */
  private async handleErrorSendingInvite(
    invite: Invite,
    error: Error
  ): Promise<void> {
    this.logger.error(
      `Failed to send an invite to \`@${invite.username}\`: ${error}`
    );
    await this.github.addComment(
      invite.repo,
      invite.issue_number,
      `You asked me to send an invite to \`@${invite.username}\`, but I ` +
        'ran into an error when I tried. You can try sending the invite ' +
        `manually, or ask ${this.helpUserTag} for help.`
    );
  }

  /**
   * Attempt to assign the user to the associated issue and comments on the
   * thread.
   *
   * Should be called in response to accepted invitations in order to update the
   * thread(s) from which the user was invited.
   */
  async tryAssign(invite: Invite, accepted: boolean): Promise<void> {
    this.logger.debug(
      `tryAssign: Trying to assign (accepted = ${accepted}`,
      invite
    );
    await this.github.assignIssue(
      invite.repo,
      invite.issue_number,
      invite.username
    );
    await this.github.addComment(
      invite.repo,
      invite.issue_number,
      accepted
        ? `The invitation to \`@${invite.username}\` was accepted! I've ` +
            'assigned them to this issue.'
        : `I've assigned this issue to \`@${invite.username}\`.`
    );
  }
}
