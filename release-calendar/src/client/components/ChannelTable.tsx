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
import {Channel} from '../../types';

interface ChannelTableProps {
  channels: Channel[];
  handleSelectedChannel: (channel: Channel, checked: boolean) => void;
}

export class ChannelTable extends React.Component<ChannelTableProps, {}> {
  constructor(props: Readonly<ChannelTableProps>) {
    super(props);
    this.handleChannelClick = this.handleChannelClick.bind(this);
  }

  rows = [
    {channel: Channel.STABLE, title: 'Stable'},
    {channel: Channel.PERCENT_BETA, title: '% Beta'},
    {channel: Channel.PERCENT_EXPERIMENTAL, title: '% Experimental'},
    {channel: Channel.OPT_IN_BETA, title: 'Opt-in Beta'},
    {channel: Channel.OPT_IN_EXPERIMENTAL, title: 'Opt-in Experimental'},
    {channel: Channel.NIGHTLY, title: 'Nightly'},
    {channel: Channel.LTS, title: 'Long Term Stable'},
  ];

  handleChannelClick = (
    channel: Channel,
    event: React.ChangeEvent<HTMLInputElement>,
  ): void => {
    this.props.handleSelectedChannel(channel, event.target.checked);
  };

  render(): JSX.Element {
    return (
      <React.Fragment>
        <h1 className='title-bar'>Current Releases</h1>
        <div className='row-container'>
          {this.rows.map((row) => {
            const rtv = '0000000000000';
            return (
              <React.Fragment key={row.channel}>
                <label className='row-button' htmlFor={row.channel}>
                  <div className={row.channel}>
                    <input
                      type='checkbox'
                      className='click-square'
                      id={row.channel}
                      onChange={(e): void =>
                        this.handleChannelClick(row.channel, e)
                      }></input>
                    <i></i>
                  </div>
                  <div className='row-text'>{row.title}</div>
                </label>
                <button className='release-button'>{rtv}</button>
              </React.Fragment>
            );
          })}
        </div>
      </React.Fragment>
    );
  }
}
