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

import {DB, KarmaReporter, Travis} from 'test-case-reporting';
import {Database, dbConnect} from '../src/db';
import {TestResultRecord} from '../src/test_result_record';
import {getFixture} from './fixtures';
import {setupDb} from '../src/setup_db';
import {truncateAll} from './testing_utils';
import Knex from 'knex';
import md5 from 'md5';

jest.mock('../src/db', () => ({
  dbConnect: (): Database =>
    Knex({
      client: 'sqlite3',
      connection: ':memory:',
      useNullAsDefault: true,
    }),
}));

describe('TestResultRecord', () => {
  let db: Database;
  let testResultRecord: TestResultRecord;

  const sampleBuild: Travis.Build = {
    buildNumber: '413413',
    commitSha: 'abcdefg123gomugomu',
  };

  const sampleJob: Travis.Job = {
    jobNumber: '413413.612',
    testSuiteType: 'unit',
  };

  let sampleKarmaReport: KarmaReporter.TestResultReport;

  beforeAll(async () => {
    db = dbConnect();
    await setupDb(db);

    testResultRecord = new TestResultRecord(db);

    sampleKarmaReport = (getFixture(
      'sample-karma-report'
    ) as unknown) as KarmaReporter.TestResultReport;
  });

  afterAll(async () => {
    await db.destroy();
  });

  afterEach(async () => {
    jest.restoreAllMocks();

    await truncateAll(db);
  });

  describe('insertTravisBuild', () => {
    it('adds the build to the database', async () => {
      await testResultRecord.insertTravisBuild(sampleBuild);

      const build = await db<DB.Build>('builds')
        .select()
        .first();

      expect(build).toMatchObject({
        'build_number': 'abcdefg123gomugomu',
        'commit_sha': '413413',
      });
    });
  });

  describe('insertTravisJob', () => {
    let buildId: number;

    beforeEach(async () => {
      buildId = await testResultRecord.insertTravisBuild(sampleBuild);
    });

    it('adds the job to the database if the build exists in the DB', async () => {
      await testResultRecord.insertTravisJob(sampleJob, buildId);

      const job = await db<DB.Job>('jobs')
        .select()
        .first();

      expect(job).toMatchObject({
        'job_number': '413413.612',
        'test_suite_type': 'unit',
      });
    });

    it("throws an error if the build doesn't exist");
  });

  describe('testStatus', () => {
    it('returns SKIP when the test was skipped', () => {
      expect(
        testResultRecord.testStatus({skipped: true, success: false})
      ).toEqual('SKIP');
    });

    it('returns PASS when the test passed', () => {
      expect(
        testResultRecord.testStatus({skipped: false, success: true})
      ).toEqual('PASS');
    });

    it('returns FAIL when the test failed', () => {
      expect(
        testResultRecord.testStatus({skipped: false, success: false})
      ).toEqual('FAIL');
    });
  });

  describe('storeTravisResults', () => {
    it('inserts test cases', async () => {
      testResultRecord.storeTravisReport({
        job: sampleJob,
        build: sampleBuild,
        result: sampleKarmaReport,
      });

      const testCases: Array<DB.TestCase> = await db<DB.TestCase>(
        'test_cases'
      ).select();

      const sampleTestCases: Array<DB.TestCase> = [
        {
          id: '8a3d71d66b2913bb981a8d4f2a2930db',
          name: 'when test is bad | it fails',
        },
        {
          id: 'c5cf7c15d50ec660c3b10b6c91bfe3f8',
          name: 'when test was skipped | it skipped',
        },
        {
          id: '36340965686c32694f88f06c6a3f71ac',
          name: '🤖 when passing test has emojis 🤖 | it passes 🎉',
        },
      ];

      expect(sampleTestCases).toMatchObject(testCases);
    });

    it('does not duplicate test cases', async () => {
      testResultRecord.storeTravisReport({
        job: sampleJob,
        build: sampleBuild,
        result: sampleKarmaReport,
      });

      testResultRecord.storeTravisReport({
        job: sampleJob,
        build: sampleBuild,
        result: sampleKarmaReport,
      });

      const testCases: Array<DB.TestCase> = await db<DB.TestCase>(
        'test_cases'
      ).select();

      const sampleTestCases: Array<DB.TestCase> = [
        {
          id: '8a3d71d66b2913bb981a8d4f2a2930db',
          name: 'when test is bad | it fails',
        },
        {
          id: 'c5cf7c15d50ec660c3b10b6c91bfe3f8',
          name: 'when test was skipped | it skipped',
        },
        {
          id: '36340965686c32694f88f06c6a3f71ac',
          name: '🤖 when passing test has emojis 🤖 | it passes 🎉',
        },
      ];

      expect(sampleTestCases).toMatchObject(testCases);
    });

    it('inserts test results', () => {
      // TODO: complete this
    });
  });
});
