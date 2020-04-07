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

import '../stylesheets/calendar.scss';
import * as React from 'react';
import {Channel} from '../../types';
import {EventSourceInput} from '@fullcalendar/core/structs/event-source';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';

export interface CalendarProps {
  events: Map<Channel, EventSourceInput>;
  selectedChannel: Map<Channel, boolean>;
}

export class Calendar extends React.Component<CalendarProps, {}> {
  render(): JSX.Element {
    const eventsToDisplay: EventSourceInput[] = [];
    for (const [channel, selected] of this.props.selectedChannel) {
      if (selected) {
        eventsToDisplay.push(this.props.events.get(channel));
      }
    }
    return (
      <div className='calendar'>
        <FullCalendar
          defaultView='dayGridMonth'
          header={{
            left: 'prev,next',
            center: 'title',
            right: 'dayGridMonth,timeGridWeek,listWeek',
          }}
          plugins={[dayGridPlugin, timeGridPlugin]}
          eventSources={eventsToDisplay}
          contentHeight={430}
          fixedWeekCount={false}
        />
      </div>
    );
  }
}
