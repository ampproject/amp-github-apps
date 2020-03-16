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
import {FAKERTVANDGITHUBLINKS, SELECTEDCHANEL} from './fakeRTVdata';
import {Header} from './Header';
import {RTVTable} from './RTVTable';

export interface AppState {
  mode: boolean;
  mostRecentRTV: string; //change to RTVObject[]
}

export class App extends React.Component<{}, AppState> {
  constructor(props: unknown) {
    super(props);
    this.state = {
      mode: true,
      mostRecentRTV: '1234567890123', //updateRTV(this.state.date) output: RTVObject[]
    };
  }
  render(): JSX.Element {
    return (
      <div>
        <Header title='AMP Release Calendar' />
        <div className='AMP-Release-Clanedar-Side-Panel'>
          <div className='AMP-Release-Calendar-RTV-Table'>
            <RTVTable
              mode={this.state.mode}
              singleRTV={this.state.mostRecentRTV} //RTVObject[]
              singleChannel={SELECTEDCHANEL} //RTVObject[]
              fakeData={FAKERTVANDGITHUBLINKS}
            />
          </div>
        </div>
      </div>
    );
  }
}
