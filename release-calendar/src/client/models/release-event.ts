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

function groupIntoChannels(events: EventInput[]): EventSourceInput[] {
  const ltsEvents: EventInput[] = [],
    stableEvents: EventInput[] = [],
    percBetaEvents: EventInput[] = [],
    percExperimentalEvents: EventInput[] = [],
    optInBetaEvents: EventInput[] = [],
    optInExperimentalEvents: EventInput[] = [],
    nightlyEvents: EventInput[] = [];

  events.forEach((event: EventInput) => {
    switch (event.className) {
      case 'lts':
        ltsEvents.push(event);
        break;
      case 'stable':
        stableEvents.push(event);
        break;
      case 'perc-beta':
        percBetaEvents.push(event);
        break;
      case 'perc-experimental':
        percExperimentalEvents.push(event);
        break;
      case 'opt-in-beta':
        optInBetaEvents.push(event);
        break;
      case 'opt-in-experimental':
        optInExperimentalEvents.push(event);
        break;
      case 'nightly':
        nightlyEvents.push(event);
        break;
      default:
        console.log('not logged');
        break;
    }
  });
  return [
    {events: ltsEvents, color: 'black', textColor: 'white'},
    {events: stableEvents, color: 'gray', textColor: 'white'},
    {events: percBetaEvents, color: 'blue', textColor: 'white'},
    {events: percExperimentalEvents, color: 'green', textColor: 'white'},
    {events: optInBetaEvents, color: 'purple', textColor: 'white'},
    {events: optInExperimentalEvents, color: 'silver', textColor: 'white'},
    {events: nightlyEvents, color: 'red', textColor: 'white'},
  ];
}

export function getEvents(releases: Release[]): EventSourceInput[] {
  return groupIntoChannels(
    releases.map(release => convertReleaseToEvent(release)),
  );
}
