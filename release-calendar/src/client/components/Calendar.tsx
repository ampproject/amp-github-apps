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
import 'tippy.js/dist/tippy.css';
import * as React from 'react';
import {ApiService} from '../api-service';
import {Channel} from '../../types';
import {EventApi, View} from '@fullcalendar/core';
import {EventCard} from './EventCard';
import {EventSourceInput} from '@fullcalendar/core/structs/event-source';
import {getAllReleasesEvents} from '../models/release-event';
import FullCalendar from '@fullcalendar/react';
import ReactDOM from 'react-dom';
import Tippy from '@tippyjs/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';

const CALENDAR_CONTENT_HEIGHT = 480;
const EVENT_LIMIT_DISPLAYED = 3;

export interface CalendarProps {
  channels: Channel[];
}

export interface CalendarState {
  events: Map<Channel, EventSourceInput>;
}

export class Calendar extends React.Component<CalendarProps, CalendarState> {
  private apiService: ApiService;

  constructor(props: Readonly<CalendarProps>) {
    super(props);
    this.state = {
      events: new Map<Channel, EventSourceInput>(),
    };
    this.apiService = new ApiService();
  }

  async componentDidMount(): Promise<void> {
    const releases = await this.apiService.getReleases();
    this.setState({events: getAllReleasesEvents(releases)});
  }

  tooltip = (arg: {
    isMirror: boolean;
    isStart: boolean;
    isEnd: boolean;
    event: EventApi;
    el: HTMLElement;
    view: View;
  }): void => {
    const Content = (): JSX.Element => (
      <Tippy
        interactive={true}
        trigger={'click'}
        placement={'left'}
        arrow={false}
        offset={[0, 5]}
        content={
          <EventCard event={arg.event}>{arg.event.classNames}</EventCard>
        }>
        <button className={'event-button'}>{arg.event.title}</button>
      </Tippy>
    );
    ReactDOM.render(<Content />, arg.el);
  };

  render(): JSX.Element {
    const displayEvents: EventSourceInput[] = this.props.channels
      .filter((channel) => this.state.events.has(channel))
      .map((channel) => this.state.events.get(channel));
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
          eventSources={displayEvents}
          contentHeight={CALENDAR_CONTENT_HEIGHT}
          fixedWeekCount={false}
          displayEventTime={false}
          views={{month: {eventLimit: EVENT_LIMIT_DISPLAYED}}}
          eventRender={this.tooltip}
        />
      </div>
    );
  }
}
