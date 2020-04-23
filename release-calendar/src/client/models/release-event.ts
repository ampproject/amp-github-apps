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

export function getAllReleasesEvents(
  events: EventInput[],
): Map<Channel, EventSourceInput> {
  const eventInputs = new Map<Channel, EventInput[]>();
  events.forEach((event) => {
    const channelEvents = eventInputs.get(event.getChannel);
    if (!channelEvents) {
      eventInputs.set(event.channel, [event]);
    } else {
      eventInputs.set(event.channel, [...channelEvents, event]);
    }
  });

  const eventSources = new Map<Channel, EventSourceInput>();
  eventInputs.forEach((eventInput, channel) => {
    eventSources.set(channel, {
      events: eventInput,
      textColor: 'white',
    });
  });
  return eventSources;
}

export function getSingleReleaseEvents(
  eventInputs: EventInput[],
): EventSourceInput[] {
  return eventInputs.map(
    (event: EventInput): EventSourceInput => {
      return {events: [event], textColor: 'white'};
    },
  );
}
