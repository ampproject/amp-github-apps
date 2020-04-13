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
import {channels} from '../../types';
import {Square} from './Square';

export class ChannelTable extends React.Component<{}, {}> {
  //TODO(ajwhatson):
  // add event handling with onClick functions
  // send state from app carrying Map<Channel, boolean> to map selected channels
  // add styling
  // add app call for most recent releases in each channel
  //

  render(): JSX.Element {
    return (
      <div className='container'>
        <div className='title-bar'>
          <h1>Current Releases</h1>
        </div>
        <div className='row-container'>
          {channels.map((channel) => {
            const rtv = '1111111111111';
            return (
              <div key={channel}>
                <div>
                  <button className='row' key={channel} value={channel}>
                    <div className='square'>
                      <Square channel={channel}></Square>
                    </div>
                    <div className='label'>{channel}</div>
                  </button>
                </div>
                <div className='rtv-button'>{rtv}</div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }
}
