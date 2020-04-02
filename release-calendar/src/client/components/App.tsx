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

import '@material/react-layout-grid/index.scss';
import * as React from 'react';
import {Calendar} from './Calendar';
import {Cell, Grid, Row} from '@material/react-layout-grid';
import {ChannelTable} from './ChannelTable';
//TODO: remove DATA and instead populate with data from ./test/development-data.ts
import {Channel} from '../../types';
import {DATA} from '../models/data';
import {EventSourceInput} from '@fullcalendar/core/structs/event-source';
import {Header} from './Header';
import {getEvents} from '../models/release-event';

interface AppState {
  events: EventSourceInput[];
  selectedChannel: Map<Channel, boolean>;
}

export class App extends React.Component<{}, AppState> {
  readonly state: AppState = {
    events: [],
    selectedChannel: new Map(),
  };

  //TODO: what is being called to the App component here
  //is still is up for debate. For example, currently I have all of the events
  //from all of forever going to the calendar component at all times and then
  //narrowing what I display in there.
  componentDidMount(): void {
    Promise.resolve(getEvents(DATA)).then(result =>
      this.setState({events: result}),
    );
    const channels: Channel[] = [
      Channel.LTS,
      Channel.STABLE,
      Channel.PERCENT_BETA,
      Channel.PERCENT_EXPERIMENTAL,
      Channel.OPT_IN_BETA,
      Channel.OPT_IN_EXPERIMENTAL,
      Channel.NIGHTLY,
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
  };

  // TODO: widths for cells are very rough, will change! Also thinking about setting
  // dimensions the same for all devices.
  render(): JSX.Element {
    return (
      <div>
        <Grid>
          <Row>
            <Cell columns={8}>
              <Header title='AMP Release Calendar' />
            </Cell>
            <Cell columns={4} align={'middle'}>
              TODO: Where the SearchBar will go
            </Cell>
          </Row>
          <hr></hr>
          <Row>
            <Cell columns={4}>
              <span> TODO: Where RTVTable will go</span>
              {/* TODO: currently only allows for single channel select, implement multiple selection with checkboxes */}
              {/* TODO: figure out how to unhighlight a row after it is unselected */}
              <ChannelTable
                selectedChannel={this.state.selectedChannel}
                handleSelectChannel={this.handleSelectChannel}
              />
            </Cell>
            {/* TODO: look into material design vertical line to divide calendar from tables */}
            <Cell columns={8}>
              {/* Add a dynamic calendar title component, changes with channel and RTV selections */}
              <Calendar
                events={this.state.events}
                selectedChannel={this.state.selectedChannel}
              />
            </Cell>
          </Row>
        </Grid>
      </div>
    );
  }
}
