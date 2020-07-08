/**
 * Copyright 2020 The AMP HTML Authors. All Rights Reserved.
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
import request from 'supertest';

import {Database, dbConnect} from '../src/db';
import {app} from '../index';
import {getFixture} from './fixtures';
import {setupDb} from '../src/setup_db';

jest.mock('../src/db', () => ({
  dbConnect: () =>
    Knex({
      client: 'sqlite3',
      connection: ':memory:',
      useNullAsDefault: true,
    }),
}));

describe('end-to-end', () => {
  let db: Database;

  beforeAll(async () => {
    db = dbConnect();
    await setupDb(db);
  });

  afterAll(() => {
    db.destroy();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    db('test_runs').truncate();
    db('test_cases').truncate();
    db('jobs').truncate();
    db('builds').truncate();
  });

  describe('when one post request is received', async () => {
    it('updates the database if the post request is good', async () => {
      await request(app)
        .post('/report')
        .send({
          build: {
            buildNumber: '413413',
            commitSha: 'abcdefg123gomugomu',
          },
          job: {
            jobNumber: '413413.612',
            testSuiteType: 'unit',
          },
          results: getFixture('sample-karma-report'),
        });

      // TODO(#914): Replace `db('table_name').select()` calls with more readable
      // functions for getting builds, jobs, and invites.
      // See https://github.com/ampproject/amp-github-apps/blob/master/invite/src/invitation_record.ts
      // for an example of what I'm thinking of.
      const builds = await db('builds').select();
      const jobs = await db('jobs').select();
      const testRuns = await db('testRunsLength').select();

      expect(builds).toHaveLength(1);
      expect(jobs).toHaveLength(1);
      expect(testRuns).toHaveLength(4);
    });
  });
});
