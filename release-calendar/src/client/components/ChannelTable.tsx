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
import {Channel, ChannelTitles} from '../../types';
import {DATA} from '../models/data';
import {Square} from './Square';
import {getCurrentReleases} from '../models/release-channel';

export interface ChannelTableProps {
  // TODO: considering moving the RTVs out of the ChannelTable Component altogether and
  // intead having them live directly next door. Still testing.
  handleSelectChannel: (selected: Channel) => void;
  selectedChannel: Map<Channel, boolean>;
  handleSelectRelease: (selected: string) => void;
  selectedRelease: string;
}

export interface ChannleTableState {
  checked: boolean;
  rtvs: Map<Channel, string>;
}

// eslint-disable-next-line prettier/prettier
export class ChannelTable extends React.Component<ChannelTableProps,ChannleTableState
> {
  state: ChannleTableState;
  constructor(props: Readonly<ChannelTableProps>) {
    super(props);
    this.state = {
      checked: false,
      rtvs: new Map(),
    };
    this.handleChannelChange = this.handleChannelChange.bind(this);
  }

  componentDidMount(): void {
    Promise.resolve(getCurrentReleases(DATA)).then(result =>
      this.setState({rtvs: result}),
    );
  }

  handleChannelChange = (value: Channel): void => {
    this.props.handleSelectChannel(value);
  };

  handleReleaseChange = (value: string): void => {
    this.props.handleSelectRelease(value);
  };

  render(): JSX.Element {
    const channels: Channel[] = [
      Channel.LTS,
      Channel.STABLE,
      Channel.PERCENT_BETA,
      Channel.PERCENT_EXPERIMENTAL,
      Channel.OPT_IN_BETA,
      Channel.OPT_IN_EXPERIMENTAL,
      Channel.NIGHTLY,
    ];
    return (
      <div className='container'>
        <p>Current Releases</p>
        <div className='row-container'>
          {channels.map(channel => {
            const rtv = this.state.rtvs.get(channel);
            return (
              // eslint-disable-next-line react/jsx-key
              <div key={channel}>
                <div>
                  <button
                    className='row'
                    key={channel}
                    value={channel}
                    onClick={(): void => this.handleChannelChange(channel)}>
                    <div className='square'>
                      <Square
                        channel={channel}
                        selected={this.props.selectedChannel.get(
                          channel,
                        )}></Square>
                    </div>
                    <div className='label'>{ChannelTitles.get(channel)}</div>
                  </button>
                </div>
                <button
                  className='rtv-button'
                  key={rtv}
                  value={rtv}
                  onClick={(): void => this.handleReleaseChange(rtv)}>
                  {rtv}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    );
  }
}
