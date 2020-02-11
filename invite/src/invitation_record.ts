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

// TODO: Enable after filling in implementations.
/* eslint-disable @typescript-eslint/no-unused-vars */

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
  async recordInvite(invite: Invite): Promise<void> {}

  /**
   * Looks up the invites for a user.
   */
  async getInvites(username: string): Promise<Array<Invite>> {
    return [];
  }

  /**
   * Marks a user's invites as archived, indicating all necessary follow-up
   * actions have been completed.
   */
  async archiveInvites(username: string): Promise<void> {}
}
