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
import {AssertionError} from 'assert';
import {DB, KarmaReporter, Travis} from 'test-case-reporting';
import {Database, dbConnect} from '../src/db';
import {TestResultRecord} from '../src/test_result_record';
import {getFixture} from './fixtures';
import {setupDb} from '../src/setup_db';
import Knex from 'knex';
import md5 from 'md5';

jest.mock('../src/db', () => ({
  dbConnect: () =>
    Knex({
      client: 'sqlite3',
      connection: ':memory:',
      useNullAsDefault: true,
    }),
}));

describe('TestResultRecord', () => {
  let db: Database;
  let testResultRecord: TestResultRecord;
  let sampleBuild: Travis.Build;
  let sampleJob: Travis.Job;
  let sampleKarmaReport: KarmaReporter.TestResultReport;

  beforeAll(async () => {
    db = dbConnect();
    await setupDb(db);

    testResultRecord = new TestResultRecord(db);

    sampleBuild = (getFixture(
      'sample-travis-build'
    ) as unknown) as Travis.Build;

    sampleJob = (getFixture('sample-travis-job') as unknown) as Travis.Job;

    sampleKarmaReport = (getFixture(
      'sample-karma-report'
    ) as unknown) as KarmaReporter.TestResultReport;
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

  describe('insertTravisBuild', () => {
    it('adds the build to the database', async () => {
      await testResultRecord.insertTravisBuild(sampleBuild);

      const build = await db<DB.Build>('builds').select().first();
      expect(build.commit_sha).toEqual(sampleBuild.commitSha);
      expect(build.build_number).toEqual(sampleBuild.buildNumber);
    });
  });

  describe('insertTravisJob', () => {
    let buildId: number;

    beforeEach(async () => {
      buildId = await testResultRecord.insertTravisBuild(sampleBuild);
    });

    it('adds the job to the database if build id is good', () => {
      testResultRecord.insertTravisJob(
        {
          jobNumber: '413413.612',
          testSuiteType: 'unit',
        },
        buildId
      );
    });

    it('fails to add the job to the database if build id is bad');
  });

  describe('testStatus', () => {
    it('returns SKIP when the test was skipped', () => {
      expect(testResultRecord.testStatus(true, false)).toEqual('SKIP');
    });

    it('returns PASS when the test passed', () => {
      expect(testResultRecord.testStatus(false, true)).toEqual('PASS');
    });

    it('returns FAIL when the test failed', () => {
      expect(testResultRecord.testStatus(false, true)).toEqual('FAIL');
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

      const sampleTestCases: Array<DB.TestCase> = sampleKarmaReport.browsers.results.map(
        result => {
          const {description, suite} = result;
          const name = testResultRecord.makeTestCaseName(description, suite);
          return {
            id: md5(name),
            name,
          };
        }
      );

      expect(sampleTestCases).toMatchObject(testCases);
    });

    it('inserts test results', () => {
      // TODO: complete this
    });

    it('handles existing test cases', () => {
      // TODO: complete this
    });
  });
});
