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

import {TestRun} from 'test-case-reporting';
import Knex from 'knex';
import request from 'supertest';

const sqliteDb = Knex({
  client: 'sqlite3',
  connection: ':memory:',
  useNullAsDefault: true,
});

// We create sqliteDb outside because each call to Knex
// with a memory connection creates a new database.
// (We want all calls to refer to the same database).
jest.mock('../src/db', () => ({
  dbConnect: (): Database => sqliteDb,
}));
import {Database, dbConnect} from '../src/db';
import {getFixture} from './fixtures';
import {setupDb} from '../src/setup_db';
import {truncateAll} from './testing_utils';

import {app} from '../app';

describe('end-to-end', () => {
  let db: Database;

  beforeAll(async () => {
    db = dbConnect();
    await setupDb(db);
  });

  afterAll(async () => {
    await db.destroy();
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await truncateAll(db);
  });

  describe('when one post request is received', () => {
    it('updates the database if the post request is good', async () => {
      let res = await request(app)
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
          result: getFixture('sample-karma-report'),
        });

      expect(res.status).toBe(201);

      // TODO(#914): Replace `db('table_name').select()` calls with more readable
      // functions for getting builds, jobs, and invites.
      // See https://github.com/ampproject/amp-github-apps/blob/master/invite/src/invitation_record.ts
      // for an example of what I'm thinking of.

      res = await request(app).get(
        '/test-results/build/413413?limit=100&offset=0&json=1'
      );

      const {testRuns}: {testRuns: Array<TestRun>} = res.body;
      expect(testRuns).toHaveLength(5);
      testRuns.forEach(testRun =>
        expect(testRun.job.build.buildNumber).toEqual('413413')
      );
    });
  });
});
