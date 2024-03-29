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

import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

import {GraphQLResponse} from 'error-monitoring';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

export function getFixtureFile(filename: string): string {
  return fs.readFileSync(path.join(__dirname, filename)).toString('utf8');
}

/**
 * Get a JSON test fixture object.
 */
export function getFixture(name: string): Record<string, unknown> {
  return JSON.parse(getFixtureFile(`${name}.json`));
}

export function getGraphQLResponse(ref: string, path: string): GraphQLResponse {
  const basename = path.replace(/\./g, '_').replace(/\//g, '-');
  return getFixture(`${ref}/${basename}`) as unknown as GraphQLResponse;
}
