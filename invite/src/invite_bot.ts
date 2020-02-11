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
import {ILogger, Invite, InviteAction} from './types';
import {InvitationRecord} from './invitation_record';

// TODO: Enable after filling in implementations.
/* eslint-disable @typescript-eslint/no-unused-vars */

/**
 * GitHub bot which can invite users to an organization and assign issues in
 * response to macro comments.
 */
export class InviteBot {
  readonly github: GitHub;
  readonly record: InvitationRecord;

  /**
   * Constructor.
   */
  constructor(client: Octokit, org: string, private logger: ILogger = console) {
    this.github = new GitHub(client, org, logger);
    this.record = new InvitationRecord(logger);
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
  async processAcceptedInvite(repo: string, username: string): Promise<void> {}

  /**
   * Parses a comment for invitation macros.
   */
  parseMacros(comment: string): Record<string, InviteAction> {
    return {};
  }

  /**
   * Attempt to invite the user, record the invite, and comment with an update
   * about the status of the invite.
   *
   * Should be called in response to new comments with the /invite or /tryassign
   * macros.
   */
  async tryInvite(invite: Invite): Promise<boolean> {
    return false;
  }

  /**
   * Attempt to assign the user to the associated issue and comments on the
   * thread.
   *
   * Should be called in response to accepted invitations in order to update the
   * thread(s) from which the user was invited.
   */
  async tryAssign(invite: Invite, accepted: boolean): Promise<void> {}
}
