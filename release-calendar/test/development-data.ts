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
import {Channel} from '../src/types';
import {Connection} from 'typeorm';
import {Release} from '../src/server/entities/release';

export async function addTestData(connection: Connection): Promise<Release[]> {
  const releaseRepo = connection.getRepository(Release);
  const manyReleases = [
    new Release(
      '1234567890123',
      Channel.NIGHTLY,
      new Date('2020-03-17T08:44:29+0100'),
      true,
    ),
    new Release(
      '2234567890123',
      Channel.STABLE,
      new Date('2020-03-12T08:44:29+0100'),
    ),
    new Release(
      '3234567890123',
      Channel.LTS,
      new Date('2020-03-10T08:44:29+0100'),
    ),
    new Release(
      '4234567890123',
      Channel.OPT_IN_EXPERIMENTAL,
      new Date('2020-03-16T08:44:29+0100'),
      false,
    ),
    new Release(
      '5234567890123',
      Channel.LTS,
      new Date('2020-03-14T08:44:29+0100'),
      true,
    ),
    new Release(
      '6234567890123',
      Channel.LTS,
      new Date('2020-03-14T08:44:29+0100'),
    ),
  ];
  await Promise.all(manyReleases.map(release => releaseRepo.save(release)));

  return await releaseRepo.find();
}
