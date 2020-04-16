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

import '../stylesheets/app.scss';
import * as React from 'react';
import {ApiService} from '../api-service';
import {Calendar} from './Calendar';
import {ChannelTable} from './ChannelTable';
import {EventSourceInput} from '@fullcalendar/core/structs/event-source';
import {Header} from './Header';
import {
  convertReleaseToEvent,
  convertPromotionToEvent,
  getEvents,
} from '../models/release-event';

interface AppState {
  channelEvents: EventSourceInput[];
  currentEvents: EventSourceInput[];
}

export class App extends React.Component<{}, AppState> {
  private apiService: ApiService;

  constructor(props: unknown) {
    super(props);
    this.state = {
      channelEvents: [],
      currentEvents: [],
    };
    this.apiService = new ApiService();
  }

  async componentDidMount(): Promise<void> {
    const releases = await this.apiService.getReleases();
    const currentEvents = getEvents(
      releases.map((release) => {
        return convertReleaseToEvent(release);
      }),
    );
    this.setState({currentEvents});
    const promotions = await this.apiService.getPromotions();
    const channelEvents = getEvents(
      promotions.map((promotion) => {
        return convertPromotionToEvent(promotion);
      }),
    );
    this.setState({channelEvents});
  }

  render(): JSX.Element {
    return (
      <React.Fragment>
        <Header title='AMP Release Calendar' />
        <div className='main-container'>
          <div className='col-channel-table'>
            <ChannelTable />
          </div>
          <div className='col-calendar'>
            <Calendar events={this.state.currentEvents} />
          </div>
        </div>
      </React.Fragment>
    );
  }
}
