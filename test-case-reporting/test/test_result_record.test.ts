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

  const sampleKarmaReport: KarmaReporter.TestResultReport = (getFixture(
    'sample-karma-report'
  ) as unknown) as KarmaReporter.TestResultReport;

  const smallerSampleKarmaReport: KarmaReporter.TestResultReport = (getFixture(
    'sample-karma-report-smaller'
  ) as unknown) as KarmaReporter.TestResultReport;

  const sampleTravisReport: Travis.Report = {
    job: sampleJob,
    build: sampleBuild,
    result: sampleKarmaReport,
  };

  beforeAll(async () => {
    db = dbConnect();
    await setupDb(db);
  });

  beforeEach(async () => {
    testResultRecord = new TestResultRecord(db);
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
        'build_number': '413413',
        'commit_sha': 'abcdefg123gomugomu',
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

    // TODO(#926): Add more unhappy path unit tests
    it.todo("throws an error if the build doesn't exist");
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

  describe('testCaseName', () => {
    it('handles small cases', () => {
      expect(
        testResultRecord.testCaseName({
          suite: ['hello 🤖'],
          description: 'world',
        })
      ).toEqual('hello 🤖 | world');
    });

    it('handles larger cases', () => {
      expect(
        testResultRecord.testCaseName({
          suite: ['hello', 'darkness', 'my', 'old'],
          description: 'friend',
        })
      ).toEqual('hello | darkness | my | old | friend');
    });

    it('handles empty suites & keeps leading/trailing whitespace', () => {
      expect(
        testResultRecord.testCaseName({suite: [], description: ' gomu gomu  '})
      ).toEqual(' gomu gomu  ');
    });

    it('handles empty strings', () => {
      expect(
        testResultRecord.testCaseName({suite: ['', ''], description: 'ora ora'})
      ).toEqual(' |  | ora ora');
    });
  });

  describe('storeTravisResults', () => {
    it('inserts the build', async () => {
      const spy = jest.spyOn(testResultRecord, 'insertTravisBuild');
      await testResultRecord.storeTravisReport(sampleTravisReport);

      expect(spy).toBeCalledWith({
        buildNumber: '413413',
        commitSha: 'abcdefg123gomugomu',
      });
    });

    it('inserts the job', async () => {
      const spy = jest.spyOn(testResultRecord, 'insertTravisJob');
      await testResultRecord.storeTravisReport(sampleTravisReport);

      expect(spy).toBeCalledWith(
        {
          'jobNumber': '413413.612',
          'testSuiteType': 'unit',
        },
        1
      );
    });

    it('inserts test cases', async () => {
      await testResultRecord.storeTravisReport(sampleTravisReport);

      const testCases: Array<DB.TestCase> = await db<DB.TestCase>(
        'test_cases'
      ).select();

      const sampleTestCases: Array<DB.TestCase> = [
        {
          id: '8fd7659c797d5b46f64917937d4805f9',
          name: 'when test is good | it passes',
        },
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
        {
          id: 'e3c1257d76c0b4d0f0c1307161ab5424',
          name:
            'when the moon hits your eye | when i was a young boy | when the fires come | it skips',
        },
      ];

      expect(testCases).toMatchObject(sampleTestCases);
    });

    it('does not duplicate test cases', async () => {
      await testResultRecord.storeTravisReport({
        job: sampleJob,
        build: sampleBuild,
        result: smallerSampleKarmaReport,
      });

      let testCases: Array<DB.TestCase> = await db<DB.TestCase>(
        'test_cases'
      ).select();

      const sampleTestCases: Array<DB.TestCase> = [
        {
          id: '8fd7659c797d5b46f64917937d4805f9',
          name: 'when test is good | it passes',
        },
        {
          id: '8a3d71d66b2913bb981a8d4f2a2930db',
          name: 'when test is bad | it fails',
        },
        {
          id: 'c5cf7c15d50ec660c3b10b6c91bfe3f8',
          name: 'when test was skipped | it skipped',
        },
      ];

      expect(testCases).toMatchObject(sampleTestCases);

      await testResultRecord.storeTravisReport(sampleTravisReport);
      testCases = await db<DB.TestCase>('test_cases').select();

      sampleTestCases.push(
        {
          id: '36340965686c32694f88f06c6a3f71ac',
          name: '🤖 when passing test has emojis 🤖 | it passes 🎉',
        },
        {
          id: 'e3c1257d76c0b4d0f0c1307161ab5424',
          name:
            'when the moon hits your eye | when i was a young boy | when the fires come | it skips',
        }
      );

      expect(testCases).toMatchObject(sampleTestCases);
    });

    it('inserts test runs', async () => {
      await testResultRecord.storeTravisReport(sampleTravisReport);

      const testRuns: Array<DB.TestRun> = await db<DB.TestRun>(
        'test_runs'
      ).select();

      const sampleTestRuns: Array<DB.TestRun> = [
        {
          'test_case_id': '8fd7659c797d5b46f64917937d4805f9',
          status: 'PASS',
          'duration_ms': 42,
          'job_id': 1,
        },
        {
          'test_case_id': '8a3d71d66b2913bb981a8d4f2a2930db',
          status: 'FAIL',
          'duration_ms': 1337,
          'job_id': 1,
        },
        {
          'test_case_id': 'c5cf7c15d50ec660c3b10b6c91bfe3f8',
          status: 'SKIP',
          'duration_ms': 413,
          'job_id': 1,
        },
        {
          'test_case_id': '36340965686c32694f88f06c6a3f71ac',
          status: 'PASS',
          'duration_ms': 123,
          'job_id': 1,
        },
        {
          'test_case_id': 'e3c1257d76c0b4d0f0c1307161ab5424',
          'status': 'SKIP',
          'duration_ms': 1234,
          'job_id': 1,
        },
      ];

      expect(testRuns).toMatchObject(sampleTestRuns);
    });
  });
});
