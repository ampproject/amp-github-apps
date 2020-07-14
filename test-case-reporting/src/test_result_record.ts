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

import {
  Build,
  DB,
  Job,
  PageInfo,
  QueryFunction,
  TestCase,
  TestRun,
  TestStatus,
  Travis,
} from 'test-case-reporting';
import {Database, TIMESTAMP_PRECISION} from './db';
import md5 from 'md5';

const msConversionConstant: number = Math.pow(10, 3 - TIMESTAMP_PRECISION);

function getDateFromTimestamp(timestamp: number): Date {
  return new Date(timestamp * msConversionConstant);
}

/* eslint-disable @typescript-eslint/camelcase */
/**
 * Creates a TestRun object from a row of the join of all the tables.
 * @param bigJoin A row of the join of all the tables. May have aliases
 *    for certain columns to avoid collisions or to fit the DB.BigJoin interface.
 */
function getTestRunFromRow({
  build_number,
  commit_sha,
  job_number,
  test_suite_type,
  name,
  created_at,
  status,
  timestamp,
  duration_ms,
}: DB.BigJoin): TestRun {
  const build: Build = {
    buildNumber: build_number,
    commitSha: commit_sha,
  };

  const job: Job = {
    build,
    jobNumber: job_number,
    testSuiteType: test_suite_type,
  };

  const testCase: TestCase = {
    name,
    createdAt: getDateFromTimestamp(created_at),
  };

  const testRun: TestRun = {
    job,
    testCase,
    status,
    timestamp: getDateFromTimestamp(timestamp),
    durationMs: duration_ms,
  };

  return testRun;
}
/* eslint-enable @typescript-eslint/camelcase */

export class TestResultRecord {
  constructor(private db: Database) {}

  async insertTravisBuild(build: Travis.Build): Promise<number> {
    const [buildId] = await this.db('builds')
      .insert({
        'commit_sha': build.commitSha,
        'build_number': build.buildNumber,
      } as DB.Build)
      .returning('id');

    return buildId;
  }

  async insertTravisJob(job: Travis.Job, buildId: number): Promise<number> {
    const [jobId] = await this.db('jobs')
      .insert({
        'build_id': buildId,
        'job_number': job.jobNumber,
        'test_suite_type': job.testSuiteType,
      } as DB.Job)
      .returning('id');

    return jobId;
  }

  testStatus({
    skipped,
    success,
  }: {
    skipped: boolean;
    success: boolean;
  }): TestStatus {
    if (skipped) {
      return 'SKIP';
    }
    return success ? 'PASS' : 'FAIL';
  }

  testCaseName({
    suite,
    description,
  }: {
    suite: Array<string>;
    description: string;
  }): string {
    return suite.concat([description]).join(' | ');
  }

  async storeTravisReport({job, build, result}: Travis.Report): Promise<void> {
    const buildId = await this.insertTravisBuild(build);
    const jobId = await this.insertTravisJob(job, buildId);

    const formattedResults = result.browsers
      .map(({results}) => results)
      .reduce((flattenedArray, array) => flattenedArray.concat(array), [])
      .map(result => {
        const testCaseName = this.testCaseName(result);
        return {
          ...result,
          testCaseId: md5(testCaseName),
          testCaseName,
        };
      });

    const testCases: Array<DB.TestCase> = formattedResults.map(
      ({testCaseId, testCaseName}) => ({
        id: testCaseId,
        name: testCaseName,
      })
    );

    const testRuns: Array<DB.TestRun> = formattedResults.map(
      ({skipped, success, time, testCaseId}) => ({
        'job_id': jobId,
        'test_case_id': testCaseId,
        status: this.testStatus({skipped, success}),
        'duration_ms': time,
      })
    );

    await this.db.raw(`? ON CONFLICT DO NOTHING;`, [
      this.db('test_cases').insert(testCases),
    ]);

    await this.db('test_runs').insert(testRuns);
  }

  /**
   * Runs a query on the join of all the tables,
   * generating a list of test runs from the join rows.
   * @param queryFunction A callback that does queries on the joined table query
   * @param pageInfo object with the limit and the offset of the query
   */
  private async bigJoinQuery(
    queryFunction: QueryFunction,
    {limit, offset}: PageInfo
  ): Promise<Array<TestRun>> {
    const baseQuery = this.db<DB.BigJoin>('builds')
      .join('jobs', 'jobs.build_id', 'builds.id')
      .join('test_runs', 'tests_runs.job_id', 'jobs.id')
      .join('test_cases', 'test_cases.id', 'test_runs.test_case_id')
      .limit(limit)
      .offset(offset);

    const fullQuery = queryFunction(baseQuery);

    const rows = await fullQuery.select(
      'builds.build_number',
      'builds.commit_sha',

      'jobs.job_number',
      'jobs.test_suite_type',

      'test_cases.name',
      'test_cases.created_at',

      'test_runs.status',
      'test_runs.timestamp',
      'test_runs.duration_ms'
    );

    return rows.map(getTestRunFromRow);
  }

  /**
   * Gets a list of the test results belonging to a build
   * @param buildNumber The number of the Travis build whose test runs we want.
   * @param pageInfo object with the limit and the offset of the query
   */
  async getTestRunsOfBuild(
    buildNumber: string,
    pageInfo: PageInfo
  ): Promise<Array<TestRun>> {
    const queryFunction: QueryFunction = q =>
      q.where('build_number', buildNumber);

    return this.bigJoinQuery(queryFunction, pageInfo);
  }

  /**
   * Gets a list of the runs of a certain test case, in chronological order.
   * @param testCaseName The name of the test case whose history we want.
   * @param pageInfo object with the limit and the offset of the query
   */
  async getTestCaseHistory(
    testCaseName: string,
    {limit, offset}: PageInfo
  ): Promise<Array<TestRun>> {
    const queryFunction: QueryFunction = q =>
      q
        .where('test_cases.name', testCaseName)
        .orderBy('test_runs.timestamp', 'DESC');

    return this.bigJoinQuery(queryFunction, {
      limit,
      offset,
    });
  }
}
