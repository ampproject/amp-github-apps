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
   * A standard logging interface.
   */
  export interface Logger {
    debug(message: string, ...extraInfo: unknown[]): void;
    warn(message: string, ...extraInfo: unknown[]): void;
    error(message: string, ...extraInfo: unknown[]): void;
    info(message: string, ...extraInfo: unknown[]): void;
  }

  /**
   * Possible job types.
   */
  export type JobType = 'unit' | 'integration';

  /**
   * Possible test statuses
   */
  export type TestStatus = 'pass' | 'fail' | 'skip' | 'error';

  /**
   * One concrete Travis build
   */
  export interface Build {
    username: string,
    commitHash: string,
    prNumber: number,
    startedAt: Date,
  }

  /**
   * One concrete job within a build
   */
  export interface Job {
    build: Build,
    jobNumber: string,
    type: JobType,
    startedAt: Date,
  }

  /**
   * One abstract kind of test case
   */
  export interface TestCase {
    name: string,
    createdAt: Date,
  }

  /**
   * One concrete run, in a job, of some testcase
   */
  export interface TestRun {
    job: Job,
    testCase: TestCase,
    status: TestStatus,
    timestamp: Date,
    durationMs: number,
  }
}
