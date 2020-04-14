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

import '../stylesheets/channelTable.scss';
import * as React from 'react';
import {Channel, channelNames} from '../../types';

export class ChannelTable extends React.Component<{}, {}> {
  //TODO(ajwhatson):
  // add event handling with onClick functions
  // send state from app carrying array of selected channels
  // add app call for most recent releases in each channel

  channels: Channel[] = [
    Channel.STABLE,
    Channel.PERCENT_BETA,
    Channel.PERCENT_EXPERIMENTAL,
    Channel.OPT_IN_BETA,
    Channel.OPT_IN_EXPERIMENTAL,
    Channel.NIGHTLY,
    Channel.LTS,
  ];

  render(): JSX.Element {
    return (
      <div>
        <div className='title-bar'>
          <h1>Current Releases</h1>
        </div>
        <div className='row-container'>
          {this.channels.map((channel: string) => {
            const rtv = '1111111111111';
            return (
              <div key={channel}>
                <label className='row-button' htmlFor={channel}>
                  <div className={channel}>
                    <input
                      type='checkbox'
                      className='square'
                      id={channel}></input>
                    <i></i>
                  </div>
                  <div className='row-text'>{channelNames[channel]}</div>
                </label>
                <button className='release-button'>{rtv}</button>
              </div>
            );
          })}
        </div>
      </div>
    );
  }
}
