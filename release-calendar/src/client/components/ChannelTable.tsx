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
import '@material/react-list/index.scss';
import * as React from 'react';
import {Channel, ChannelTitles} from '../../types';
import {DATA} from '../models/data';
import {Square} from './Square';
import {getCurrentReleases} from '../models/release-channel';
// import List, {
//   ListGroup,
//   ListGroupSubheader,
//   ListItem,
//   ListItemGraphic,
//   ListItemMeta,
//   ListItemText,
// } from '@material/react-list';

export interface ChannelTableProps {
  // TODO: considering moving the RTVs out of the ChannelTable Component altogether and
  // intead having them live directly next door. Still testing.
  handleSelectChannel: (selected: Channel) => void;
  selectedChannel: Map<Channel, boolean>;
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
      <div>
        <div className='container'>
          <h2>CurrentReleases</h2>
          {channels.map(channel => {
            return (
              // eslint-disable-next-line react/jsx-key
              <div key={channel} className='row'>
                <div>
                  <button
                    key={channel}
                    value={channel}
                    onClick={(): void => this.handleChannelChange(channel)}>
                    {ChannelTitles.get(channel)}
                    <Square
                      channel={channel}
                      selected={this.props.selectedChannel.get(
                        channel,
                      )}></Square>
                  </button>
                </div>
                <button>{this.state.rtvs.get(channel)}</button>
              </div>
            );
          })}
        </div>
        {/* <ListGroup>
          <ListGroupSubheader tag='h2'>Current Releases</ListGroupSubheader>
          <List
            singleSelection
            selectedIndex={this.props.selectedChannel}
            handleSelect={this.handleChannelChange}>
            {channels.map((channel, index) => {
              return (
                // eslint-disable-next-line react/jsx-key
                <div>
                  <ListItem className='outline'>
                    <ListItemGraphic
                      graphic={
                        <Square
                          channel={channel}
                          selected={
                            this.props.selectedChannel === index
                          }></Square>
                      }
                    />
                    <ListItemText
                      className='noOutline'
                      primaryText={ChannelTitles.get(channel)}
                    />
                    <ListItemMeta
                      meta={<button>{this.state.rtvs.get(channel)}</button>}
                    />
                  </ListItem>
                  <hr className='mdc-list-divider--inset' />
                </div>
              );
            })}
          </List>
        </ListGroup> */}
      </div>
    );
  }
}
