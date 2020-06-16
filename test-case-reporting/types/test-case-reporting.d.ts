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

declare module 'test-case-reporting' {
  /**
   * Travis job types for which test results may be reported.
   */
  export type JobType = 'unit' | 'integration';

  export type TestStatus = 'PASS' | 'FAIL' | 'SKIP' | 'ERROR';

  /** A build on Travis. */
  export interface Build {
    username: string,
    commitHash: string,
    pullRequestNumber: number,
    startedAt: Date,

    // The list of jobs we know are contained in the build.
    // When we create a build, we fill this with its jobs, but when
    // we get a build from a server, the jobs list may not be populated
    // if the jobs are not needed.
    jobs: Array<Job>,
  }

  /** A job within a Travis build. */
  export interface Job {
    jobNumber: string,
    type: JobType,
    startedAt: Date,

    // This list is treated similarly to the `jobs` array of the `Build` type.
    // Read the comment on `jobs` for info.
    testRuns: Array<TestRun>,
  }

  /** A single kind of test case, one `it` or `test` block. */
  export interface TestCase {
    name: string,
    createdAt: Date,
  }

  /** An instance of a test being run, with results. */
  export interface TestRun {
    testCase: TestCase,
    status: TestStatus,
    timestamp: Date,
    durationMs: number,
  }

  namespace DB {
    export interface Build {
      // `id` is nullable because is not set when uploading, it is only set
      // when we get the build from the database.
      // It is not nullable in the database.
      id?: number,
      commit_hash: string,
      pull_request_number: number,
      started_at: number,
    }

    export interface Job {
      // See comment under `DB.Build.id`
      id?: number,
      buld_id: number,
      job_number: string,
      test_suite_type: string,
      started_at: number,
    }

    export interface TestCase {
      // See comment under `DB.Build.id`
      id?: number,
      name: string,
      created_at: number,
    }

    export interface TestRun {
      // See comment under `DB.Build.id`
      id?: number,
      job_id: number,
      test_case_id: number,
      status: TestStatus,
      timestamp: number,
      duration_ms: number,
    }
  }
}
