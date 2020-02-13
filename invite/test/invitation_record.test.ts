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
  const otherInvite: Invite = {
    username: 'someone',
    repo: 'test_repo',
    issue_number: 42,
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

      const recordedInvite: Invite = await db('invites').first();
      expect(recordedInvite).toMatchObject(invite);
      done();
    });

    it('sets `archived = false`', async done => {
      record.recordInvite(invite);

      const recordedInvite: Invite = await db('invites').first();
      expect(recordedInvite.archived).toBeFalsy();
      done();
    });
  });

  describe('getInvites', () => {
    describe('if no invite record exists for the user', () => {
      it('returns an empty list', async done => {
        expect(record.getInvites('someone')).resolves.toEqual([]);
        done();
      });
    });

    describe('if records exist of invites to the user', () => {
      beforeEach(async () => {
        await record.recordInvite(invite);
        await record.recordInvite(otherInvite);
      });

      it('returns the invites', async done => {
        const invites: Array<Invite> = await record.getInvites('someone');

        expect(invites[0]).toMatchObject(invite);
        expect(invites[1]).toMatchObject(otherInvite);
        done();
      });
    });

    describe('if only archived invite records exists for the user', () => {
      beforeEach(async () => {
        await record.recordInvite(archivedInvite);
      });

      it('returns an empty list', async done => {
        expect(record.getInvites('someone')).resolves.toEqual([]);
        done();
      });
    });
  });

  describe('archiveInvites', () => {
    describe('if records exist of any invites to the user', () => {
      beforeEach(async () => {
        await record.recordInvite(invite);
        await record.recordInvite(otherInvite);
      });

      it('updates the invite records', async done => {
        await record.archiveInvites('someone');

        expect(record.getInvites('someone')).resolves.toEqual([]);
        const invites = await db('invites').select();
        expect(invites[0].archived).toBeTruthy();
        expect(invites[1].archived).toBeTruthy();

        done();
      });
    });
  });
});
