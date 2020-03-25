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

import {Release} from '../../types';

export function getMostRecentChannelRTVs(
  releases: Release[],
): Map<string, string> {
  const channels: string[] = [
    'lts',
    'stable',
    'perc-beta',
    'perc-experimental',
    'opt-in-beta',
    'opt-in-experimental',
    'nightly',
  ];
  const map = new Map();
  channels.forEach(channel =>
    map.set(channel, releases.find(release => release.channel == channel).name),
  );
  return map;
}
