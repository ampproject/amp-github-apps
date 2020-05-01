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
import {Calendar} from './Calendar';
import {Channel} from '../../types';
import {ChannelTable} from './ChannelTable';
import {Header} from './Header';

interface AppState {
  channels: Channel[];
  release: string;
}

export class App extends React.Component<{}, AppState> {
  constructor(props: unknown) {
    super(props);
    this.state = {
      channels: [],
      release: null,
    };
  }

  handleSelectedChannel = (channel: Channel, toChecked: boolean): void => {
    this.setState({
      channels: toChecked
        ? this.state.channels.concat(channel)
        : this.state.channels.filter((item) => channel !== item),
    });
  };

  handleSelectedRelease = (selectedRelease: string): void => {
    this.setState({
      release: this.state.release != selectedRelease ? selectedRelease : null,
    });
  };

  render(): JSX.Element {
    return (
      <React.Fragment>
        <Header title='AMP Release Calendar' />
        <div className='main-container'>
          <div className='col-channel-table'>
            <ChannelTable
              channels={this.state.channels}
              handleSelectedChannel={this.handleSelectedChannel}
              handleSelectedRelease={this.handleSelectedRelease}
            />
          </div>
          <div className='col-calendar'>
            <Calendar
              channels={this.state.channels}
              singleRelease={this.state.release}
            />
          </div>
        </div>
      </React.Fragment>
    );
  }
}
