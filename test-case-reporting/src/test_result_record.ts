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
  TestCase,
  TestRun,
  TestStatus,
  Travis,
} from 'test-case-reporting';
import {Database} from './db';
import {QueryBuilder} from 'knex';
import md5 from 'md5';

type QueryFunction = (q: QueryBuilder) => QueryBuilder;

/* eslint-disable @typescript-eslint/camelcase */
/**
 * Creates a TestRun object from a row of the join of all the tables.
 * @param bigJoin A row of the join of all the tables. May have aliases
 *    for certain columns to avoid collisions or to fit the DB.BigJoin interface.
 */
function getTestRunFromRow({
  build_number,
  build_started_at,
  commit_sha,
  job_number,
  test_suite_type,
  name,
  created_at,
  status,
  timestamp,
  duration_ms,
}: DB.TestRunWithJobAndBuild): TestRun {
  const build: Build = {
    buildNumber: build_number,
    commitSha: commit_sha,
    startedAt: new Date(build_started_at),
  };

  const job: Job = {
    build,
    jobNumber: job_number,
    testSuiteType: test_suite_type,
  };

  const testCase: TestCase = {
    id: md5(name),
    name,
    createdAt: new Date(created_at),
  };

  const testRun: TestRun = {
    job,
    testCase,
    status,
    timestamp: new Date(timestamp),
    durationMs: duration_ms,
  };

  return testRun;
}
/* eslint-enable @typescript-eslint/camelcase */

export class TestResultRecord {
  constructor(private db: Database) {}

  /**
   * Gets a DB.Build from the database by its build number.
   * If there is no such build, it returns undefined.
   * @param buildNumber The number of the Travis build, as a string.
   */
  private async getDbBuildFromBuildNumber(
    buildNumber: string
  ): Promise<DB.Build> {
    return this.db<DB.Build>('builds')
      .where('build_number', buildNumber)
      .first();
  }

  /**
   * Inserts a build, as reported by Travis, into the database.
   * Does not insert duplicate builds, but still returns their ids.
   * @param build The build we want to insert in the database.
   * @returns The id of the build in the database.
   */
  async insertTravisBuild(build: Travis.Build): Promise<number> {
    const existingBuild = await this.getDbBuildFromBuildNumber(
      build.buildNumber
    );
    if (existingBuild) {
      return existingBuild.id;
    }

    const [buildId] = await this.db('builds')
      .insert({
        'commit_sha': build.commitSha,
        'build_number': build.buildNumber,
      } as DB.Build)
      .returning('id');

    return buildId;
  }

  /**
   * Inserts a job, as reported by Travis, into the database.
   */
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

  /**
   * Helper that generates a test status string from the status booleans of the Karma report.
   */
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

  /**
   * Helper that generates the name of a test case from its suite and description.
   */
  testCaseName({
    suite,
    description,
  }: {
    suite: Array<string>;
    description: string;
  }): string {
    return suite.concat([description]).join(' | ');
  }

  /**
   * Stores a travis report on the database. This involves inserting
   * a job, a build, many test runs, and many test cases.
   * Duplicate test cases and builds are not inserted.
   * @param travisReport Travis report with job, build, and test run result info.
   */
  async storeTravisReport({job, build, results}: Travis.Report): Promise<void> {
    const buildId = await this.insertTravisBuild(build);
    const jobId = await this.insertTravisJob(job, buildId);

    const formattedResults = results.browsers
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
    const baseQuery = this.db<DB.TestRunWithJobAndBuild>('test_runs')
      .leftJoin('test_cases', 'test_cases.id', 'test_runs.test_case_id')
      .leftJoin('jobs', 'jobs.id', 'test_runs.job_id')
      .leftJoin('builds', 'builds.id', 'jobs.build_id');

    const fullQuery = queryFunction(baseQuery).limit(limit).offset(offset);

    const rows = await fullQuery.select(
      'builds.build_number',
      'builds.commit_sha',
      'builds.started_at as build_started_at',

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
    testCaseId: string,
    pageInfo: PageInfo
  ): Promise<Array<TestRun>> {
    const queryFunction: QueryFunction = q =>
      q
        .where('test_cases.id', testCaseId)
        .orderBy('test_runs.timestamp', 'DESC');

    return this.bigJoinQuery(queryFunction, pageInfo);
  }

  /**
   * Gets a list of the most recently uploaded builds
   * @param pageInfo object with the limit and the offset of the query
   */
  async getRecentBuilds({limit, offset}: PageInfo): Promise<Array<Build>> {
    const dbBuilds = await this.db<DB.Build>('builds')
      .orderBy('started_at', 'DESC')
      .limit(limit)
      .offset(offset);

    /* eslint-disable @typescript-eslint/camelcase */
    return dbBuilds.map(({commit_sha, build_number, started_at}) => ({
      commitSha: commit_sha,
      buildNumber: build_number,
      startedAt: new Date(started_at),
    }));
    /* eslint-enable @typescript-eslint/camelcase */
  }

  /**
   * Gets a list of the test cases with highest fail/pass/skip/error percentage
   * @param pageInfo Object with the limit and the offset of the query
   * @param stat Which test status we want to sort by
   * @param sampleSize The sample size of the computed stats we want
   */
  async getTestCasesSortedByStat(
    sampleSize: number,
    stat: string,
    {limit, offset}: PageInfo
  ): Promise<Array<TestCase>> {
    if (!['passed', 'failed', 'skipped', 'errored'].includes(stat)) {
      throw new TypeError(`Bad stat used for sorting test cases: "${stat}"`);
    }

    const dbTestCases: Array<DB.TestCase & DB.TestCaseStats> = await this.db(
      'test_case_stats'
    )
      .where('test_case_stats.sample_size', sampleSize)
      .join('test_cases', 'test_cases.id', 'test_case_stats.test_case_id')
      .select<Array<DB.TestCase & DB.TestCaseStats>>(
        this.db.raw('?? / (?? + ?? + ?? + ??) AS ??', [
          stat,
          'passed',
          'failed',
          'skipped',
          'errored',
          `${stat}_percent`,
        ]),
        '*'
      )
      .orderBy(`${stat}_percent`, 'DESC')
      .limit(limit)
      .offset(offset);

    /* eslint-disable @typescript-eslint/camelcase */
    return dbTestCases.map(
      ({
        id,
        name,
        created_at,
        sample_size,
        passed,
        failed,
        skipped,
        errored,
      }) => ({
        id,
        name,
        createdAt: new Date(created_at),
        stats: {
          sampleSize: sample_size,
          passed,
          failed,
          skipped,
          errored,
        },
      })
    );
    /* eslint-enable @typescript-eslint/camelcase */
  }
}
