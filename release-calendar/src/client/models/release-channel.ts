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

function getMostRecent(channel: Channel, releases: Release[]): string {
  let currentRelease: Release = null;
  releases.forEach(release => {
    if (release.channel == channel && !release.isRollback) {
      if (currentRelease == null || currentRelease.date < release.date) {
        currentRelease = release;
      }
    }
  });
  return currentRelease.name;
}
export function getCurrentReleases(releases: Release[]): Map<Channel, string> {
  const channels: Channel[] = [
    Channel.LTS,
    Channel.STABLE,
    Channel.PERCENT_BETA,
    Channel.PERCENT_EXPERIMENTAL,
    Channel.OPT_IN_BETA,
    Channel.OPT_IN_EXPERIMENTAL,
    Channel.NIGHTLY,
  ];
  const map = new Map();
  channels.forEach(channel =>
    map.set(channel, getMostRecent(channel, releases)),
  );
  return map;
}
