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

import {Database} from '../src/db';

// We don't await these with a Promise.all
// because they need to be truncated in this order
// due to foreign key constraints
export async function truncateAll(db: Database): Promise<void> {
  await db('test_runs').truncate();
  await db('test_cases').truncate();
  await db('jobs').truncate();
  await db('builds').truncate();
}
