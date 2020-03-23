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

import {Channel, Release} from '../../types';

export const DATA = [
  new Release(
    '1111111111111',
    Channel.LTS,
    new Date('2020-03-01T08:44:29'),
    true,
  ),
  new Release('2222222222222', Channel.STABLE, new Date('2020-03-02T08:44:29')),
  new Release(
    '333333333333',
    Channel.PERCENT_BETA,
    new Date('2020-03-03T08:44:29'),
  ),
  new Release(
    '4444444444444',
    Channel.PERCENT_EXPERIMENTAL,
    new Date('2020-03-04T08:44:29'),
    false,
  ),
  new Release(
    '5555555555555',
    Channel.OPT_IN_BETA,
    new Date('2020-03-05T08:44:29'),
    true,
  ),
  new Release(
    '6666666666666',
    Channel.OPT_IN_EXPERIMENTAL,
    new Date('2020-03-06T08:44:29'),
  ),
  new Release(
    '7777777777777',
    Channel.NIGHTLY,
    new Date('2020-03-07T08:44:29'),
  ),
  new Release('8888888888888', Channel.LTS, new Date('2020-03-08T08:44:29')),
  new Release('9999999999999', Channel.LTS, new Date('2020-03-09T08:44:29')),
  new Release('2111111111111', Channel.LTS, new Date('2020-03-10T08:44:29')),
  new Release('233333333333', Channel.LTS, new Date('2020-03-11T08:44:29')),
];
