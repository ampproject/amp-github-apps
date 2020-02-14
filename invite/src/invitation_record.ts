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

import {Database} from './db';
import {ILogger, Invite} from './types';

/**
 * A record of invites sent by the bot that may require follow-up actions.
 */
export class InvitationRecord {
  /**
   * Constructor.
   */
  constructor(private db: Database, private logger: ILogger = console) {}

  /**
   * Records an invite created by the bot.
   */
  async recordInvite(invite: Invite): Promise<void> {
    this.logger.info(
      `recordInvite: Recording ${invite.action} to @${invite.username} from ` +
      `${invite.repo}#{invite.issue_number} (archived = ${invite.archived}).`
    );
    await this.db('invites').insert(invite);
  }

  /**
   * Looks up the invites for a user.
   */
  async getInvites(username: string): Promise<Array<Invite>> {
    this.logger.info(`getInvites: Looking up recorded invites to @${username}`);
    return (await this.db('invites')
      .select()
      .where({username, archived: false}))
      .map(invite => {
        // PostgresQL stores booleans as TINYINT, so we cast it to boolean.
        invite.archived = !!invite.archived;
        return invite;
      });
  }

  /**
   * Marks a user's invites as archived, indicating all necessary follow-up
   * actions have been completed.
   */
  async archiveInvites(username: string): Promise<void> {
    this.logger.info(`archiveInvites: Archiving invites to @${username}`);
    await this.db('invites')
      .where({username})
      .update({archived: true});
  }
}
