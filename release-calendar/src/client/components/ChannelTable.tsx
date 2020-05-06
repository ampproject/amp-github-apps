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
import {ApiService} from '../api-service';
import {Channel} from '../../types';
import {CurrentReleases} from '../models/view-models';

interface Titles {
  [key: string]: {title: string};
}

interface ChannelTableState {
  currentReleases: Map<Channel, string>;
}

interface ChannelTableProps {
  channels: Channel[];
  handleSelectedChannel: (channel: Channel, checked: boolean) => void;
  handleSelectedRelease: (release: string, clearSearchInput: boolean) => void;
}

export const channelTitles: Titles = {
  [Channel.STABLE]: {title: 'Stable'},
  [Channel.PERCENT_BETA]: {title: '% Beta'},
  [Channel.PERCENT_EXPERIMENTAL]: {title: '% Experimental'},
  [Channel.OPT_IN_BETA]: {title: 'Opt-in Beta'},
  [Channel.OPT_IN_EXPERIMENTAL]: {title: 'Opt-in Experimental'},
  [Channel.NIGHTLY]: {title: 'Nightly'},
  [Channel.LTS]: {title: 'Long Term Stable'},
};

export class ChannelTable extends React.Component<
  ChannelTableProps,
  ChannelTableState
> {
  private apiService: ApiService;

  constructor(props: Readonly<ChannelTableProps>) {
    super(props);
    this.state = {
      currentReleases: new Map<Channel, string>(),
    };
    this.apiService = new ApiService();
    this.handleChannelClick = this.handleChannelClick.bind(this);
  }

  async componentDidMount(): Promise<void> {
    const currentReleases: CurrentReleases = await this.apiService.getCurrentPromotions();
    this.setState({currentReleases: currentReleases.map});
  }

  handleChannelClick = (
    channel: Channel,
    event: React.ChangeEvent<HTMLInputElement>,
  ): void => {
    this.props.handleSelectedChannel(channel, event.target.checked);
  };

  handleReleaseClick = (release: string): void => {
    this.props.handleSelectedRelease(release, true);
  };

  render(): JSX.Element {
    return (
      <React.Fragment>
        <h1 className='title-bar'>Current Releases</h1>
        <div className='row-container'>
          {Object.values(Channel).map((channel) => {
            return (
              <React.Fragment key={channel}>
                <label className='row-button' htmlFor={channel}>
                  <div className={channel}>
                    <input
                      type='checkbox'
                      className='click-square'
                      id={channel}
                      checked={this.props.channels.includes(channel)}
                      onChange={(e): void =>
                        this.handleChannelClick(channel, e)
                      }></input>
                    <i></i>
                  </div>
                  <div className='row-text'>{channelTitles[channel].title}</div>
                </label>
                <button
                  className='release-button'
                  onClick={(): void =>
                    this.handleReleaseClick(
                      this.state.currentReleases.get(channel),
                    )
                  }>
                  {this.state.currentReleases.get(channel)}
                </button>
              </React.Fragment>
            );
          })}
        </div>
      </React.Fragment>
    );
  }
}
