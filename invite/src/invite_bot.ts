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

import {dbConnect} from './db';
import {GitHub} from './github';
import {ILogger, Invite, InviteAction} from './types';
import {InvitationRecord} from './invitation_record';

const INVITE_MACROS: Record<string, InviteAction> = {
  invite: InviteAction.INVITE,
  tryassign: InviteAction.INVITE_AND_ASSIGN,
};

// Regex source: https://github.com/shinnn/github-username-regex
const USERNAME_PATTERN: string = '[a-z\\d](?:[a-z\\d]|-(?=[a-z\\d])){0,38}';
const MACRO_PATTERN: string = `/(${Object.keys(INVITE_MACROS).join('|')})`;
const FULL_MACRO_REGEX: RegExp = new RegExp(
  // (?<!\\S) ensures the macro is not preceded by a non-space character.
  `(?<!\\S)${MACRO_PATTERN} @${USERNAME_PATTERN}`,
  'ig'
);

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
   * Optional helpUsernameToTag parameter allows specifying someone to tag in the
   * event that the invite fails to send for some reason. If left as null, the
   * comment will just say "ask someone for help".
   * Example: 'ampproject/wg-infra'
   */
  constructor(
    client: Octokit,
    private org: string,
    helpUsernameToTag: string | null = null,
    private logger: ILogger = console,

  ) {
    this.github = new GitHub(client, org, logger);
    this.record = new InvitationRecord(dbConnect(), logger);
    this.helpUserTag = helpUsernameToTag === null ?
      'someone in your organization' :
      `@${helpUsernameToTag}`;
  }

  /**
   * Process a comment by identifying and acting on any macros present.
   */
  async processComment(
    repo: string,
    issue_number: number,
    comment: string
  ): Promise<void> {}

  /**
   * Process an accepted invite by adding comments and assigning issues.
   */
  async processAcceptedInvite(username: string): Promise<void> {}

  /**
   * Parses a comment for invitation macros.
   */
  parseMacros(comment: string): Record<string, InviteAction> {
    const macros: Record<string, InviteAction> = {};
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
    const existingInvites = await this.record.getInvites(invite.username);
    const pendingInvite = !!existingInvites.length;

    if (pendingInvite) {
      return await this.handlePendingInvite(invite);
    }

    // The user has not been invited by the bot yet, so try and send an invite.
    let invited = false;
    try {
      invited = await this.github.inviteUser(invite.username);
    } catch (error) {
      return await this.handleErrorSendingInvite(invite, error);
    }

    if (!invited) {
      return await this.handleUserAlreadyMember(invite);
    }

    await this.handleNewInviteSent(invite);
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
  private async handleErrorSendingInvite(invite: Invite, error: Error): Promise<void> {
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

    throw error;
  }

  /**
   * Attempt to assign the user to the associated issue and comments on the
   * thread.
   *
   * Should be called in response to accepted invitations in order to update the
   * thread(s) from which the user was invited.
   */
  async tryAssign(invite: Invite, accepted: boolean): Promise<void> {
    await this.github.assignIssue(
      invite.repo,
      invite.issue_number,
      invite.username
    );
    await this.github.addComment(
      invite.repo,
      invite.issue_number,
      accepted ?
        `The invitation to \`@${invite.username}\` was accepted! I've ` +
        'assigned them to this issue.' :
        `I've assigned this issue to \`@${invite.username}\`.`
    );
  }
}
