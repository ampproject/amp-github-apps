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

import {Build, DB, Job, TestCase, TestRun} from 'test-case-reporting';
import {Database, TIMESTAMP_PRECISION} from './db';

const msConversionConstant: number = Math.pow(10, 3 - TIMESTAMP_PRECISION);

// Types in the DB namespace interface use snake_case instead of camelCase.
/* eslint @typescript-eslint/camelcase: "off" */

function getDateFromTimestamp(timestamp: number): Date {
  return new Date(timestamp * msConversionConstant);
}

export class TestResultsRecords {
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
   * Gets a DB.Build from the database by its id.
   * If there is no such build, it returns undefined.
   * @param buildId The database id of the Travis build, as a number.
   */
  private async getDbBuildFromId(buildId: number): Promise<DB.Build> {
    return this.db<DB.Build>('builds').where('id', buildId).first();
  }

  /**
   * Makes a Build from a DB.Build.
   * @param dbBuild A build as obtained from the database.
   */
  private getBuildFromDbBuild(dbBuild: DB.Build): Build {
    return {
      commitSha: dbBuild.commit_sha,
      buildNumber: dbBuild.build_number,
      startedAt: getDateFromTimestamp(dbBuild.started_at),
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

  /**
   * Gets a Build from the database by its id.
   * If there is no such build, it returns undefined.
   * @param buildId The database id of the Travis build, as a number.
   */
  private async getBuildFromId(buildId: number): Promise<Build> {
    const dbBuild = await this.getDbBuildFromId(buildId);
    return this.getBuildFromDbBuild(dbBuild);
  }

  /**
   * Gets a DB.Job from the database by its id.
   * If there is no such job, it returns undefined.
   * @param jobId The database id of the Travis job, as a number.
   */
  private async getDbJobFromId(jobId: number): Promise<DB.Job> {
    return this.db<DB.Job>('jobs').where('id', jobId).first();
  }

  /**
   * Gets a Job from the database by its id.
   * If there is no such job, it returns undefined.
   * @param jobId The database id of the Travis job, as a number.
   */
  private async getJobFromId(jobId: number): Promise<Job> {
    const dbJob = await this.getDbJobFromId(jobId);
    return this.getJobFromDbJob(dbJob);
  }

  /**
   * Makes a Job from a DB.Job. Asynchronous because it needs to
   * query the database for the build information.
   * @param dbJob A job as obtained from the database.
   */
  private async getJobFromDbJob(dbJob: DB.Job): Promise<Job> {
    return {
      build: await this.getBuildFromId(dbJob.build_id),
      jobNumber: dbJob.job_number,
      testSuiteType: dbJob.test_suite_type,
      startedAt: getDateFromTimestamp(dbJob.started_at),
    };
  }

  /**
   * Makes a TestCase from a DB.TestCase.
   * @param dbTestCase A test case as obtained from the database.
   */
  private getTestCaseFromDbTestCase(dbTestCase: DB.TestCase): TestCase {
    return {
      name: dbTestCase.name,
      createdAt: getDateFromTimestamp(dbTestCase.created_at),
    };
  }

  /**
   * Gets a TestCase from the database by its id.
   * If there is no such test case, it returns undefined.
   * @param testCaseId The database id of the test case, as a number.
   */
  private async getTestCaseFromId(testCaseId: number): Promise<TestCase> {
    const dbTestCase = await this.db<DB.TestCase>('test_cases')
      .where('id', testCaseId)
      .first();
    return this.getTestCaseFromDbTestCase(dbTestCase);
  }

  /**
   * Gets every DB.TestRun associated with a certain build, identified by its build number.
   * If no build corresponds to the number, this returns an empty list.
   * @param buildNumber The number of the Travis build whose test runs we want, as a string.
   */
  private async getDbTestRunsFromBuildNumber(
    buildNumber: string
  ): Promise<DB.TestRun[]> {
    const buildId = (await this.getDbBuildFromBuildNumber(buildNumber)).id;
    return this.db<DB.TestRun>('test_runs').where('build_id', buildId);
  }

  /**
   * Makes a TestRun from a DB.TestRun. Asynchronous because it needs to
   * query the database for the job & test case information.
   * @param dbTestRun A test run as obtained from the database.
   */
  private async getTestRunFromDbTestRun(
    dbTestRun: DB.TestRun
  ): Promise<TestRun> {
    return {
      job: await this.getJobFromId(dbTestRun.job_id),
      testCase: await this.getTestCaseFromId(dbTestRun.test_case_id),
      status: dbTestRun.status,
      timestamp: getDateFromTimestamp(dbTestRun.timestamp),
      durationMs: dbTestRun.duration_ms,
    };
  }

  /**
   * Gets every TestRun associated with a certain build, identified by its build number.
   * If no build corresponds to the number, this returns an empty list.
   * @param buildNumber The number of the Travis build whose test runs we want, as a string.
   */
  public async getTestRunsFromBuildNumber(
    buildNumber: string
  ): Promise<TestRun[]> {
    const dbTestRuns = await this.getDbTestRunsFromBuildNumber(buildNumber);
    const testRunPromises = dbTestRuns.map(this.getTestRunFromDbTestRun);
    return Promise.all(testRunPromises);
  }
}
