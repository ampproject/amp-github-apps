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

import Knex from 'knex';

import {Database} from '../src/db';
import {setupDb} from '../src/setup_db';
import {Invite, InviteAction} from '../src/types';
import {InvitationRecord} from '../src/invitation_record';

describe('invitation record', () => {
  const db: Database = Knex({
    client: 'sqlite3',
    connection: ':memory:',
    useNullAsDefault: true,
  });
  let record: InvitationRecord;
  const invite: Invite = {
    username: 'someone',
    repo: 'test_repo',
    issue_number: 1337,
    action: InviteAction.INVITE,
  };
  const archivedInvite: Invite = Object.assign({archived: true}, invite);

  beforeAll(async () => setupDb(db));
  afterAll(async () => db.destroy());

  beforeEach(() => {
    record = new InvitationRecord(db);
  });

  afterEach(async () => db('invites').truncate());

  describe('recordInvite', () => {
    it('records an invite', async done => {
      record.recordInvite(invite);

      expect(
        await db('invites')
          .select()
          .first()
      ).toEqual(invite);
      done();
    });

    it('sets `archived = false`', async done => {
      expect(
        await db('invites')
          .pluck('archived')
          .first()
      ).toEqual(false);
      done();
    });
  });

  describe('getInvites', () => {
    describe('if no invite record exists for the user', () => {
      it('returns an empty list', async done => {
        expect(await record.getInvites('someone')).toEqual([]);
        done();
      });
    });

    describe('if records exists of invites to the user', () => {
      beforeEach(async () => {
        await record.recordInvite(invite);
      });

      it('returns the invites', async done => {
        expect(await record.getInvites('someone')).toEqual([invite]);
        done();
      });
    });

    describe('if only archived invite records exists for the user', () => {
      beforeEach(async () => {
        await record.recordInvite(archivedInvite);
      });

      it('returns an empty list', async done => {
        expect(await record.getInvites('someone')).toEqual([]);
        done();
      });
    });
  });

  describe('archiveInvites', () => {
    describe('if records exists of any invites to the user', () => {
      beforeEach(async () => {
        await record.recordInvite(invite);
        await record.recordInvite({
          username: 'someone',
          repo: 'test_repo',
          issue_number: 42,
          action: InviteAction.INVITE,
        });
      });

      it('updates the invite records', async done => {
        await record.archiveInvites('someone');

        const invites: Array<Invite> = await record.getInvites('someone');
        expect(invites[0].archived).toBe(true);
        expect(invites[1].archived).toBe(true);

        done();
      });
    });
  });
});
