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

/* eslint-disable @typescript-eslint/camelcase */
import {DB, Travis} from 'test-case-reporting';
import {Database} from './db';
import {getBuildStartTime} from './travis_api_utils';

export class TestResultsRecords {
  constructor(private db: Database) {}

  async storeTravisReport({job, build, result}: Travis.Report): Promise<void> {
    const dbBuild: DB.Build = {
      commit_sha: build.commitSha,
      build_number: build.buildNumber,
      started_at: getBuildStartTime(build.buildNumber),
    };

    // TODO: Finish this method.
  }
}
