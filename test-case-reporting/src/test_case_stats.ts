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

import {Database} from './db';
import {TestStatus} from 'test-case-reporting';
import Knex from 'knex';

const TEST_STATUSES: Array<TestStatus> = ['PASS', 'FAIL', 'SKIP', 'ERROR'];

export class TestCaseStats {
  constructor(private db: Database) {}

  /**
   * Updates status count stats for all test cases. `INSERT OR REPLACE` is not a
   * native feature of many DB engines (including Postgres), and trying to
   * manually implement it introduces significant complexity and performance
   * issues. Instead, we update stats in three steps:
   * 1. Mark all existing stats for the given sample size as "dirty"
   * 2. Compute new counts for each test case and insert the new "clean" counts
   * 3. Delete dirty/outdated stats
   *
   * @param sampleSize the number of test runs included in the total count
   */
  async updateStats(sampleSize: number): Promise<void> {
    const trx = await this.db.transaction();

    try {
      await this.markDirtyStats(trx, sampleSize);
      await this.computeNewStats(trx, sampleSize);
      await this.removeDirtyStats(trx, sampleSize);

      await trx.commit();
    } catch (e) {
      console.error('Error updating stats; rolling back', e);
      await trx.rollback();
    }
  }

  /**
   * Mark existing test case stats for some sample size as outdated.
   *
   * @param sampleSize the number of test runs included in the total count
   * @param dirty whether to mark the stat as dirty; if false, marks clean
   */
  async markDirtyStats(
    trx: Knex.Transaction,
    sampleSize: number
  ): Promise<void> {
    await trx('test_case_stats')
      .where({'sample_size': sampleSize})
      .update({dirty: true});
  }

  /**
   * Remove outdated test case stats once newer results have been populated.
   *
   * @param sampleSize the number of test runs included in the total count
   */
  async removeDirtyStats(
    trx: Knex.Transaction,
    sampleSize: number
  ): Promise<void> {
    await trx('test_case_stats')
      .where({'sample_size': sampleSize, dirty: true})
      .delete();
  }

  /**
   * Compute pass/fail/skip/error counts for all test cases over the last
   * `sampleSize` jobs. There are tens of thousands of test cases and many times
   * that for test runs, so this function is optimized/structured to allow
   * Postgres to do all the work on the database, rather than shipping data here
   * to process in pages.
   *
   * @param sampleSize the number of test runs included in the total count
   */
  async computeNewStats(
    trx: Knex.Transaction,
    sampleSize: number
  ): Promise<void> {
    // Select the set of test runs linked to the last N jobs; this is done
    // because selecting the first N of a group-by clause is very inefficient,
    // but the subquery here using the jobs table as a proxy has the same effect
    // but with better query performance.
    const lastNBuilds = this.db('builds')
      .orderBy('started_at', 'DESC')
      .limit(sampleSize)
      .select('id');
    const testRunsFromLastNBuilds = this.db('test_runs')
      .join('jobs', 'test_runs.job_id', 'jobs.id')
      .select()
      .whereIn('jobs.build_id', lastNBuilds);

    // Create new boolean column indicating if the test run has a given status.
    const hasStatus = (status: TestStatus): Knex.Raw =>
      this.db.raw(
        `(CASE WHEN status = ? THEN 1 ELSE 0 END) AS status_${status}`,
        [status]
      );
    // Construct a subquery table containing test case IDs along with boolean
    // columns indicating which status the run has
    const testRunsWithMeta = testRunsFromLastNBuilds
      .as('latest_runs')
      .select('test_case_id', ...TEST_STATUSES.map(hasStatus));

    // Create aggregated columns summing the boolean status columns.
    const countStatus = (status: string): Knex.Raw =>
      this.db.raw(`SUM(status_${status}) AS count_${status.toLowerCase()}`, []);

    const thisDb = this.db;
    await trx
      .from(
        // This is the syntax required by Knex to insert a subquery's columns.
        this.db.raw('?? (??, ??, ??, ??, ??, ??)', [
          'test_case_stats',
          'test_case_id',
          'sample_size',
          'pass',
          'fail',
          'skip',
          'error',
        ])
      )
      .insert(function () {
        // Group test runs by test case, summing up the status columns into new
        // columns containing counts for each status type.
        this.from(testRunsWithMeta.as('test_runs_meta'))
          .groupBy('test_case_id')
          .select(
            'test_case_id',
            thisDb.raw('?', sampleSize),
            ...TEST_STATUSES.map(countStatus)
          );
      });
  }
}
