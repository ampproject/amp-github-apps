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

import * as React from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
//import interactionPlugin from '@fullcalendar/interaction';

import '../stylesheets/calendarStyle.scss';
import {EventSourceInput} from '@fullcalendar/core/structs/event-source';

export interface CalendarProps {
  events: EventSourceInput[];
}
export interface CalendarState {
  calendarWeekends: boolean;
}

export class Calendar extends React.Component<CalendarProps, CalendarState> {
  constructor(props: Readonly<CalendarProps>) {
    super(props);
    this.state = {
      calendarWeekends: true,
    };
  }
  render(): JSX.Element {
    const allCalenderEvents = this.props.events;
    console.log(this.props.events);
    return (
      <div className='demo-app'>
        <div className='demo-app-top'>
          <button onClick={this.toggleWeekends}>toggle weekends</button>&nbsp;
        </div>
        <div className='demo-app-calendar'>
          <FullCalendar
            defaultView='dayGridMonth'
            header={{
              left: 'prev,next',
              center: 'title',
              right: 'dayGridMonth,timeGridWeek,listWeek',
            }}
            plugins={[dayGridPlugin, timeGridPlugin]}
            weekends={this.state.calendarWeekends}
            eventSources={allCalenderEvents}
          />
        </div>
      </div>
    );
  }

  toggleWeekends = (): void => {
    this.setState({
      calendarWeekends: !this.state.calendarWeekends,
    });
  };
}
