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

import {EventInput} from '@fullcalendar/core/structs/event';
import {EventSourceInput} from '@fullcalendar/core/structs/event-source';
import {Release} from '../../types';

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
  releases.forEach(release => {
    const event = convertReleaseToEvent(release);
    const channelEvents = map.get(event.className);
    if (!channelEvents) {
      map.set(event.className, [event]);
    } else {
      map.set(event.className, [...channelEvents, event]);
    }
  });
  return [
    {events: map.get('lts'), color: 'black', textColor: 'white'},
    {events: map.get('stable'), color: 'gray', textColor: 'white'},
    {events: map.get('perc-beta'), color: 'blue', textColor: 'white'},
    {events: map.get('perc-experimental'), color: 'green', textColor: 'white'},
    {events: map.get('opt-in-beta'), color: 'purple', textColor: 'white'},
    {
      events: map.get('opt-in-experimental'),
      color: 'silver',
      textColor: 'white',
    },
    {events: map.get('nightly'), color: 'red', textColor: 'white'},
  ];
}
