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
import nock from 'nock';
import request from 'supertest';

import {Database, dbConnect} from '../src/db';
import {app} from '../index';
import {getFixtureAsString} from './fixtures';
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
    nock.disableNetConnect();
    process.env = {
      DB_UNIX_SOCKET: 'amp-test-cases/socket',
      DB_USER: 'test_user',
      DB_PASSWORD: 'test_password',
      DB_NAME: 'test_results',
      NODE_ENV: 'test',
    };

    db = dbConnect();
    await setupDb(db);
  });

  afterAll(() => {
    nock.enableNetConnect();
    db.destroy();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    db('builds').truncate();
    db('jobs').truncate();
    db('test_cases').truncate();
    db('test_runs').truncate();

    // Fail the test if there were unused nocks.
    if (!nock.isDone()) {
      nock.cleanAll();
      throw new Error('Not all nock interceptors were used!');
    }
  });

  describe('when one post request is received', async () => {
    it('updates the database if the post request is good', async () => {
      await request(app)
        .post('/report')
        .send(getFixtureAsString('sample-karma-report.json'));

      // TODO(rafer45): Replace `db('table_name').select()` calls with more readable
      // functions for getting builds, jobs, and invites.
      // See https://github.com/ampproject/amp-github-apps/blob/master/invite/src/invitation_record.ts
      // for an example of what I'm thinking of.
      const buildsLength = (await db('builds').select()).length;
      const jobsLength = (await db('jobs').select()).length;
      const testRunsLength = (await db('testRunsLength').select()).length;

      expect(buildsLength).toEqual(1);
      expect(jobsLength).toEqual(1);
      expect(testRunsLength).toEqual(3);
    });
  });
});
