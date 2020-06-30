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

// Types in the DB namespace interface use snake_case instead of camelCase.
/* eslint @typescript-eslint/camelcase: "off" */
function getDateFromTimestamp(timestamp: number): Date {
  const msConversionConstant: number = Math.pow(10, 3 - TIMESTAMP_PRECISION);
  return new Date(timestamp * msConversionConstant);
}

export class TestResultsRecords {
  constructor(private db: Database) {}

  /**
   * Gets a DB.Build from the database by its name.
   * If there is no build, it returns undefined.
   * @param buildNumber The number of the Travis build, as a string
   */
  private async getDbBuild(buildNumber: string): Promise<DB.Build> {
    return this.db<DB.Build>('builds')
      .where('build_number', buildNumber)
      .first();
  }

  private async getBuildWithEmptyJobs(buildNumber: string): Promise<Build> {
    const dbBuild = await this.getDbBuild(buildNumber);
    return {
      commitSha: dbBuild.commit_sha,
      buildNumber: dbBuild.build_number,
      startedAt: getDateFromTimestamp(dbBuild.started_at),
      jobs: [],
    };
  }

  private makeTestCaseFromRow(row): TestCase {
    return {
      name: row.test_case_name,
      createdAt: getDateFromTimestamp(row.test_case_created_at),
    };
  }

  private makeTestRunFromRow(row): TestRun {
    return {
      testCase: this.makeTestCaseFromRow(row),
      status: row.test_run_status,
      timestamp: getDateFromTimestamp(row.test_run_timestamp),
      durationMs: row.duration_ms,
    };
  }

  /**
   * Helper method.
   * Takes a row of the join of every table.
   * Makes a job containing only the test run described in that row.
   * @param row A row of the join of every table, with some columns
   * renamed for clarity.
   */
  private makeJobFromRow(row): Job {
    return {
      jobNumber: row.job_number,
      testSuiteType: row.test_suite_type,
      startedAt: getDateFromTimestamp(row.job_started_at),
      testRuns: [this.makeTestRunFromRow(row)],
    };
  }

  async getBuild(buildNumber: string): Promise<Build> {
    const build = await this.getBuildWithEmptyJobs(buildNumber);
    const joinOfEveryTable = await this.db('builds')
      .select([
        'test_runs.job_id',
        'jobs.started_at as job_started_at',
        'jobs.test_suite_type',
        'jobs.job_number',
        'jobs.job_number',

        'test_cases.name as test_case_name',
        'test_cases.created_at as test_case_created_at',

        'test_runs.status as test_run_status',
        'test_runs.timestamp as test_run_timestamp',
        'test_runs.duration_ms as test_run_duration_ms',
      ])
      .where('build_number', buildNumber)
      .join('jobs', 'jobs.build_id', 'builds.id')
      .join('test_runs', 'test_runs.job_id', 'jobs.id')
      .join('test_cases', 'test_cases.id', 'test_runs.test_case_id');

    const jobs = joinOfEveryTable
      .reduce((jobDict, row) => {
        if (!jobDict[row.job_id]) {
          jobDict[row.job_id] = this.makeJobFromRow(row);
        } else {
          jobDict[row.job_id].push(this.makeTestCaseFromRow(row));
        }
        return jobDict;
      }, {})
      .values();

    build.jobs = jobs;

    return build;
  }
}
