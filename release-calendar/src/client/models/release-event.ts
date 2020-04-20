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
    //TODO: I plan to use className as how I will move colors to central location
    className: release.channel,
    extendedProps: {isRollback: release.isRollback},
  };
}

export function getEvents(releases: Release[]): Map<Channel, EventSourceInput> {
  //TODO: move colors out to a central location so that colors
  //are not seperately declared for the calendar and for the ChannelTable
  const colors = new Map();
  colors.set(Channel.LTS, 'black');
  colors.set(Channel.STABLE, 'gray');
  colors.set(Channel.PERCENT_BETA, 'blue');
  colors.set(Channel.PERCENT_EXPERIMENTAL, 'green');
  colors.set(Channel.OPT_IN_BETA, 'purple');
  colors.set(Channel.OPT_IN_EXPERIMENTAL, 'silver');
  colors.set(Channel.NIGHTLY, 'red');

  const eventInputs = new Map<Channel, EventInput[]>();
  releases.forEach((release) => {
    const event = convertReleaseToEvent(release);
    const channelEvents = eventInputs.get(release.channel);
    if (!channelEvents) {
      eventInputs.set(release.channel, [event]);
    } else {
      eventInputs.set(release.channel, [...channelEvents, event]);
    }
  });
  const eventSources = new Map<Channel, EventSourceInput>();
  eventInputs.forEach((eventInput, channel) => {
    eventSources.set(channel, {
      events: eventInput,
      //TODO: will remove when colors declarations are moved to a central location
      color: colors.get(channel),
      textColor: 'white',
    });
  });
  return eventSources;
}
