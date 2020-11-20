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
import {SearchBar} from './SearchBar';

interface AppState {
  channels: Channel[];
  release: string;
  input: string;
}

export class App extends React.Component<unknown, AppState> {
  constructor(props: unknown) {
    super(props);
    this.state = {
      channels: [],
      release: null,
      input: null,
    };
  }

  componentDidMount(): void {
    this.setState({channels: Object.values(Channel)});
  }

  handleSelectedChannel = (channel: Channel, toChecked: boolean): void => {
    const channels = toChecked
      ? this.state.channels.concat(channel)
      : this.state.channels.filter((item) => channel !== item);
    this.setState({channels});
    this.handleSearchInput(null);
    if (this.state.release) {
      this.setState({release: null});
    }
  };

  handleSelectedRelease = (
    selectedRelease: string,
    clearSearchInput: boolean,
  ): void => {
    const release =
      this.state.release != selectedRelease ? selectedRelease : null;
    this.setState({release});
    if (this.state.channels.length) {
      this.setState({channels: []});
    }
    if (clearSearchInput) {
      this.handleSearchInput(null);
    }
  };

  handleSearchInput = (input: string): void => {
    if (this.state.input != input) {
      this.setState({input});
    }
  };

  render(): JSX.Element {
    return (
      <React.Fragment>
        <Header title='AMP Release Calendar' />
        <div className='main-container'>
          <div className='col-channel-table'>
            <div className='search-bar'>
              <SearchBar
                handleSelectedRelease={this.handleSelectedRelease}
                input={this.state.input}
                handleSearchInput={this.handleSearchInput}
              />
            </div>
            <div className='channel-table'>
              <ChannelTable
                channels={this.state.channels}
                handleSelectedChannel={this.handleSelectedChannel}
                handleSelectedRelease={this.handleSelectedRelease}
              />
            </div>
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
