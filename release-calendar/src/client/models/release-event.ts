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

import {Channel} from '../../types';
import {EventInput} from '@fullcalendar/core/structs/event';
import {EventSourceInput} from '@fullcalendar/core/structs/event-source';
import {Release} from './view-models';

function convertReleaseToEvent(release: Release): EventInput {
  return {
    title: release.name,
    start: release.date,
    className: release.channel,
    extendedProps: {isRollback: release.isRollback},
  };
}

export function getEvents(releases: Release[]): EventSourceInput[] {
  const map = new Map();
  releases.forEach((release) => {

    const event = convertReleaseToEvent(release);
    const channelEvents = mapRelease.get(event.className);
    if (!channelEvents) {
      mapRelease.set(event.className, [event]);
    } else {
      mapRelease.set(event.className, [...channelEvents, event]);
    }
  });
  const map: Map<Channel, EventSourceInput> = new Map();
  map.set(Channel.LTS, {
    events: mapRelease.get('lts'),
    color: 'black',
    textColor: 'white',
  });
  map.set(Channel.STABLE, {
    events: mapRelease.get('stable'),
    color: 'gray',
    textColor: 'white',
  });
  map.set(Channel.PERCENT_BETA, {
    events: mapRelease.get('perc-beta'),
    color: 'blue',
    textColor: 'white',
  });
  map.set(Channel.PERCENT_EXPERIMENTAL, {
    events: mapRelease.get('perc-experimental'),
    color: 'green',
    textColor: 'white',
  });
  map.set(Channel.OPT_IN_BETA, {
    events: mapRelease.get('opt-in-beta'),
    color: 'purple',
    textColor: 'white',
  });
  map.set(Channel.OPT_IN_EXPERIMENTAL, {
    events: mapRelease.get('opt-in-experimental'),
    color: 'silver',
    textColor: 'white',
  });
  map.set(Channel.PERCENT_NIGHTLY, {
    events: mapRelease.get('perc-nightly'),
    color: 'red',
    textColor: 'white',
  });
  map.set(Channel.OPT_IN_NIGHTLY, {
    events: mapRelease.get('opt-in-nightly'),
    color: 'orange',
    textColor: 'white',
  });
  return map;
}
