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
import {Header} from './Header';
import {ChannelTable} from './ChannelTable';
import {RTVTable} from './RTVTable';
import {Calendar} from './Calendar';
//TODO: remove all fake data imported below and add TODOs that pull from MySQL APIs that will be created
import {SELECTEDCHANEL, FAKEEVENTS, FAKERTVANDGITHUBLINKS, CURRENTRELEASES} from '../../../test/development-data';


export interface AppState {
  mode: boolean;
  today: Date;
  mostRecentRTV: string; //change to RTVObject[]
  searchedValue: string;
}
export class App extends React.Component<{},AppState > {
  constructor(props: unknown) {
    super(props)
    this.state= {
      mode: true,
      today: new Date(),
      mostRecentRTV: '1234567890123',  //updateRTV(this.state.date) output: RTVObject[]
      searchedValue: 'Before'
    };
  }
  //uses date to get the most Recent RTV object and 
  //all of the RTV objects assocaiated with that RTV 
  //as it goes through the channels
  //TODO: create function updateRTV(this.state.date)
  // to pull from the datebase the most recent RTV
  componentDidMount(): void {
    setInterval( () => this.refresh(),
    60000
    );
  }
  refresh(): void {
    this.setState({
      today: new Date(),
      mostRecentRTV: '222222222222' //updateRTV(this.state.date) output RTVObject[]
    });
  }
  handleSearch = (searchValue: string): void => {
    this.setState({searchedValue: searchValue});
}

  render(): JSX.Element {
    console.log(this.state.searchedValue);
    return (
      <div className="AMP-Release-Calendar">
        <div className="AMP-Release-Calendar-Header">
          <Header title="AMP Release Calendar" handleSearch={this.handleSearch} />
        </div>
        <h4>{'this is what was searched: ' + this.state.searchedValue}</h4>
        <div className="AMP-Release-Calendar-Side-Panel">
          <RTVTable
            mode={this.state.mode}
            singleRTV={this.state.mostRecentRTV} //RTVObject[]
            singleChannel={SELECTEDCHANEL} //RTVObject[]
            fakeData={FAKERTVANDGITHUBLINKS}
          />
          <ChannelTable currentReleases={CURRENTRELEASES} />
        </div>
        <div className="AMP-Release-Calendar-Full-Calendar">
          
          <Calendar events={FAKEEVENTS} />
          <h5>{'last updated at ' + this.state.today}</h5>
          //TODO: add button to refresh manually
        </div>
      </div>
    );
  }
}
