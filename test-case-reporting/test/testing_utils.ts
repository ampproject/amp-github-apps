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

import {DB} from 'test-case-reporting';
import {Database} from '../src/db';
import md5 from 'md5';

// We don't await these with a Promise.all
// because they need to be truncated in this order
// due to foreign key constraints
export async function truncateAll(db: Database): Promise<void> {
  await db('test_runs').truncate();
  await db('test_cases').truncate();
  await db('jobs').truncate();
  await db('builds').truncate();
}

/**
 * Fills the database with builds, test cases, jobs, and test runs.
 * Stores 3 test cases.
 * Stores 2 builds: the first one has 5 jobs and
 * 15 test runs (one per (job, test case) pair).
 * The second one has 1 job and 1 test run.
 * @param db The database we want to fill.
 */
export async function fillDatabase(db: Database): Promise<void> {
  let [buildId] = await db('builds')
    .insert({
      'commit_sha': 'deadbeefdeadbeef123123',
      'build_number': '12123434',
    } as DB.Build)
    .returning('id');

  const jobIds: Array<number> = [];

  let [jobId] = await db('jobs').insert({
    'build_id': buildId,
    'job_number': '12123434.1',
    'test_suite_type': 'unit',
  } as DB.Job);
  jobIds.push(jobId);

  [jobId] = await db('jobs').insert({
    'build_id': buildId,
    'job_number': '12123434.1',
    'test_suite_type': 'integration',
  } as DB.Job);
  jobIds.push(jobId);

  [jobId] = await db('jobs').insert({
    'build_id': buildId,
    'job_number': '12123434.2',
    'test_suite_type': 'unit',
  } as DB.Job);
  jobIds.push(jobId);

  [jobId] = await db('jobs').insert({
    'build_id': buildId,
    'job_number': '12123434.2',
    'test_suite_type': 'integration',
  } as DB.Job);
  jobIds.push(jobId);

  [jobId] = await db('jobs').insert({
    'build_id': buildId,
    'job_number': '12123434.3',
    'test_suite_type': 'unit',
  } as DB.Job);
  jobIds.push(jobId);

  const testCaseIds: Array<string> = await db('test_cases')
    .insert([
      {
        id: md5('case | 1'),
        name: 'case | 1',
      },
      {
        id: md5('case | 2'),
        name: 'case | 2',
      },
      {
        id: md5('case | 3'),
        name: 'case | 3',
      },
    ] as Array<DB.TestCase>)
    .returning('id');

  const dbTestRuns: Array<DB.TestRun> = [];

  jobIds.forEach((jobId: number) => {
    testCaseIds.forEach((testCaseId: string) => {
      dbTestRuns.push({
        'job_id': jobId,
        'test_case_id': testCaseId,
        status: 'PASS',
        'duration_ms': 4242,
      });
    });
  });

  await db('test_runs').insert(dbTestRuns);

  [buildId] = await db('builds')
    .insert({
      'commit_sha': 'faefaefae99',
      'build_number': '12129999',
    } as DB.Build)
    .returning('id');

  [jobId] = await db('jobs').insert({
    'build_id': buildId,
    'job_number': '12129999.1',
    'test_suite_type': 'unit',
  } as DB.Job);

  await db('test_runs').insert({
    'job_id': jobId,
    'test_case_id': md5('case | 1'),
    status: 'SKIP',
    'duration_ms': 413,
  });
}
