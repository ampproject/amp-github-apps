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
   * Makes a Build from a DB.Build.
   * @param dbBuild A build as obtained from the database.
   */
  private getBuildFromDbBuild(dbBuild: DB.Build): Build {
    return {
      commitSha: dbBuild.commit_sha,
      buildNumber: dbBuild.build_number,
    };
  }

  /**
   * Gets a Build from the database by its build number.
   * If there is no such build, it returns undefined.
   * @param buildNumber The number of the Travis build, as a string
   */
  private async getBuildFromBuildNumber(buildNumber: string): Promise<Build> {
    const dbBuild = await this.getDbBuildFromBuildNumber(buildNumber);
    return this.getBuildFromDbBuild(dbBuild);
  }

  private async getTestRunsOfBuild(
    buildNumber: string
  ): Promise<Array<TestRun>> {
    const build: Build = await this.getBuildFromBuildNumber(buildNumber);

    const dbJoins: Array<DB.BigJoin> = await this.db<DB.BigJoin>('builds')
      .where('build_number', buildNumber)
      .join('jobs', 'jobs.build_id', 'builds.id')
      .join('test_runs', 'tests_runs.job_id', 'jobs.id')
      .join('test_cases', 'test_cases.id', 'test_runs.test_case_id')
      .select(
        'jobs.job_number',
        'jobs.test_suite_type',

        'test_cases.name',
        'test_cases.created_at',

        'test_runs.status',
        'test_runs.timestamp',
        'test_runs.duration_ms'
      );

    const testRuns: Array<TestRun> = dbJoins.map(
      ({
        job_number,
        test_suite_type,
        name,
        created_at,
        status,
        timestamp,
        duration_ms,
      }: DB.BigJoin) => ({
        job: {
          build,
          jobNumber: job_number,
          testSuiteType: test_suite_type,
        },

        testCase: {
          name,
          createdAt: getDateFromTimestamp(created_at),
        },

        status,
        timestamp: getDateFromTimestamp(timestamp),
        durationMs: duration_ms,
      })
    );

    return testRuns;
  }
}
