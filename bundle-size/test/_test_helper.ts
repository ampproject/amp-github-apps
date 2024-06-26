/**
 * Copyright 2019 The AMP HTML Authors. All Rights Reserved.
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

import knex from 'knex';

import type {RestfulOctokit} from '../src/types/rest-endpoint-methods';

type RestEndpointMethodTypes = RestfulOctokit['rest'];
export type OctokitParamsType<
  T extends keyof RestEndpointMethodTypes,
  S extends keyof RestEndpointMethodTypes[T],
> = RestEndpointMethodTypes[T][S] extends (...args: infer P) => unknown
  ? P[0]
  : never;
export type OctokitResponseType<
  T extends keyof RestEndpointMethodTypes,
  S extends keyof RestEndpointMethodTypes[T],
> = RestEndpointMethodTypes[T][S] extends (...args: infer P) => infer Q
  ? Awaited<Q>
  : never;

export function inMemoryDbConnect() {
  return knex({
    client: 'sqlite3',
    connection: ':memory:',
    useNullAsDefault: true,
  });
}
