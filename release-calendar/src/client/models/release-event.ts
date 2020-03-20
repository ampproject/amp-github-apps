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
import {EventTuple, Release} from '../../types';

function convertReleaseToEvent(release: Release): EventTuple {
  return [
    release.channel,
    {
      title: release.name,
      start: release.date,
      extendedProps: {isRollback: release.isRollback},
    },
  ];
}

export function getEvents(releases: Release[]): EventSourceInput[] {
  const dict: {[channel: string]: EventInput[]} = {};
  dict['lts'] = [];
  dict['stable'] = [];
  dict['perc-beta'] = [];
  dict['perc-experimental'] = [];
  dict['opt-in-beta'] = [];
  dict['opt-in-experimental'] = [];
  dict['nightly'] = [];

  const channelEventPairs: EventTuple[] = releases.map(release =>
    convertReleaseToEvent(release),
  );

  channelEventPairs.forEach(pair => dict[pair[0]].push(pair[1]));

  return [
    {events: dict['lts'], color: 'black', textColor: 'white'},
    {events: dict['stable'], color: 'gray', textColor: 'white'},
    {events: dict['perc-beta'], color: 'blue', textColor: 'white'},
    {events: dict['perc-experimental'], color: 'green', textColor: 'white'},
    {events: dict['opt-in-beta'], color: 'purple', textColor: 'white'},
    {events: dict['opt-in-experimental'], color: 'silver', textColor: 'white'},
    {events: dict['nightly'], color: 'red', textColor: 'white'},
  ];
}
