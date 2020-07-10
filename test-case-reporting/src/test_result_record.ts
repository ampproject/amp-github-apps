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

import {DB, TestStatus, Travis} from 'test-case-reporting';
import {Database} from './db';
import md5 from 'md5';

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
}
