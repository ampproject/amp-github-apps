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
import '../stylesheets/header.scss';
import '../stylesheets/square.scss';
import * as React from 'react';
import {ApiService} from '../api-service';
import {Calendar} from './Calendar';
import {CalendarTitle} from './CalendarTitle';
import {Channel} from '../../types';
import {ChannelTable} from './ChannelTable';
import {EventSourceInput} from '@fullcalendar/core/structs/event-source';
import {Header} from './Header';
//import {getCurrentReleases} from '../models/release-channel';
import {getEvents} from '../models/release-event';

interface AppState {
  events: Map<Channel, EventSourceInput>;
  selectedChannel: Map<Channel, boolean>;
  selectedRelease: string;
  currentReleases: Map<Channel, string>;
}

export class App extends React.Component<{}, AppState> {
  private apiService: ApiService = new ApiService();

  readonly state: AppState = {
    events: new Map(),
    selectedChannel: new Map(),
    selectedRelease: null,
    currentReleases: new Map(),
  };
  async componentDidMount(): Promise<void> {
    const releases = await this.apiService.getReleases();
    const events = getEvents(releases);
    this.setState({events});
    //const current = getCurrentReleases(releases);
    //this.setState({currentReleases: current});

    const channels: Channel[] = [
      Channel.LTS,
      Channel.STABLE,
      Channel.PERCENT_BETA,
      Channel.PERCENT_EXPERIMENTAL,
      Channel.OPT_IN_BETA,
      Channel.OPT_IN_EXPERIMENTAL,
      Channel.PERCENT_NIGHTLY,
      Channel.OPT_IN_NIGHTLY,
    ];
    const map = new Map();
    channels.forEach(channel => map.set(channel, false));
    this.setState({selectedChannel: map});
  }

  handleSelectChannel = (selected: Channel): void => {
    const replace: Map<Channel, boolean> = this.state.selectedChannel.set(
      selected,
      !this.state.selectedChannel.get(selected),
    );
    this.setState({
      selectedChannel: replace,
    });
    this.setState({selectedRelease: null});
  };

  handleSelectRelease = (selected: string): void => {
    if (this.state.selectedRelease === selected) {
      this.setState({selectedRelease: null});
    } else {
      this.setState({selectedRelease: selected});
      const channels: Channel[] = [
        Channel.LTS,
        Channel.STABLE,
        Channel.PERCENT_BETA,
        Channel.PERCENT_EXPERIMENTAL,
        Channel.OPT_IN_BETA,
        Channel.OPT_IN_EXPERIMENTAL,
        Channel.PERCENT_NIGHTLY,
        Channel.OPT_IN_NIGHTLY,
      ];
      const map = new Map();
      channels.forEach(channel => map.set(channel, false));
      this.setState({selectedChannel: map});
    }
  };

  // TODO: widths for cells are very rough, will change! Also thinking about setting
  // dimensions the same for all devices.
  render(): JSX.Element {
    const calendarTitle: string =
      this.state.selectedRelease != null
        ? this.state.selectedRelease + ' History'
        : 'Selected Channels';
    return (
      <div className='AMP-Calendar'>
        <div className='header'>
          <Header title='AMP Release Calendar' />
        </div>
        <div className='main-container'>
          <div className='col-sidePannel'>
            <ChannelTable
              selectedChannel={this.state.selectedChannel}
              handleSelectChannel={this.handleSelectChannel}
              selectedRelease={this.state.selectedRelease}
              handleSelectRelease={this.handleSelectRelease}
              currentReleases={this.state.currentReleases}
            />
          </div>
          <div className='col-break'></div>
          <div className='col-calendar'>
            <CalendarTitle title={calendarTitle}></CalendarTitle>
            <Calendar
              events={this.state.events}
              selectedChannel={this.state.selectedChannel}
            />
          </div>
        </div>
      </div>
    );
  }
}
