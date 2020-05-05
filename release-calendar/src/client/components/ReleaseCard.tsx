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

import '../stylesheets/releaseCard.scss';
import * as React from 'react';
import {ApiService} from '../api-service';
import {Channel, Promotion} from '../../types';
import {EventApi} from '@fullcalendar/core';
import {channelTitles} from './ChannelTable';
import moment from 'moment-timezone';

export interface ReleaseCardProps {
  eventApi: EventApi;
}

interface ReleaseCardState {
  releaseDates: Promotion[];
}

export class ReleaseCard extends React.Component<
  ReleaseCardProps,
  ReleaseCardState
> {
  private apiService: ApiService;

  constructor(props: Readonly<ReleaseCardProps>) {
    super(props);
    this.state = {
      releaseDates: null,
    };
    this.apiService = new ApiService();
  }
  async componentDidMount(): Promise<void> {
    const release = await this.apiService.getReleaseDates(
      this.props.eventApi.title,
    );
    this.setState({releaseDates: release.promotions});
  }

  history = [
    {
      channel: Channel.NIGHTLY,
      emoji: '🌙',
      emojiName: 'moon',
    },
    {
      channel: Channel.OPT_IN_EXPERIMENTAL,
      emoji: '✋',
      emojiName: 'hand',
    },
    {
      channel: Channel.PERCENT_EXPERIMENTAL,
      emoji: '🧪',
      emojiName: 'experiment',
    },
    {
      channel: Channel.STABLE,
      emoji: '🏠',
      emojiName: 'house',
    },
    {
      channel: Channel.LTS,
      emoji: '🏙️',
      emojiName: 'city',
    },
  ];

  getTitle(search: Channel): string {
    if (search == Channel.OPT_IN_EXPERIMENTAL) {
      return `${
        channelTitles.find(
          (channel) => channel.channel == Channel.OPT_IN_EXPERIMENTAL,
        ).title
      }, ${
        channelTitles.find((channel) => channel.channel == Channel.OPT_IN_BETA)
          .title
      }`;
    } else if (search == Channel.PERCENT_EXPERIMENTAL) {
      return `${
        channelTitles.find(
          (channel) => channel.channel == Channel.PERCENT_EXPERIMENTAL,
        ).title
      }, ${
        channelTitles.find((channel) => channel.channel == Channel.PERCENT_BETA)
          .title
      }`;
    } else {
      return channelTitles.find((channel) => channel.channel == search).title;
    }
  }

  render(): JSX.Element {
    return (
      <div className='event-card'>
        <div className={this.props.eventApi.classNames[0]}>
          <div className='event-top'></div>
          <div className='event-content'>
            <div className='content-row'>
              <div className='big-emoji'>
                <span role='img' aria-label='train'>
                  {'🚄'}
                </span>
              </div>
              <h2
                className={
                  'title-row'
                }>{`Release ${this.props.eventApi.title}`}</h2>
            </div>
            <div className='content-content'>
              {/* TODO: uncomment below when cherrypick is connected 
              (will be adding cherrypick attribute to releaseDates) */}
              {/* {this.state.releaseDates.cherrypick && (
                <div className='content-row'>
                  <div className='emoji'>
                    <span role='img' aria-label='flower'>
                      {'🌸'}
                    </span>
                  </div>
                  <div className='text'>{'Cherrypick!'}</div>
                </div>
              )} */}
              <div className='content-row'>
                <div className='emoji'>
                  <span role='img' aria-label='laptop'>
                    {'🔗'}
                  </span>
                </div>
                <div className='text'>
                  <a
                    href={`https://github.com/ampproject/amphtml/releases/tag/${this.props.eventApi.title}`}
                    target='_blank'
                    rel='noopener noreferrer'>
                    {'GitHub Release'}
                  </a>
                </div>
              </div>
              <h3 className='subtitle-row'>{'Release History'}</h3>
              {this.state.releaseDates != null &&
                this.state.releaseDates.map((row) => {
                  const match = this.history.find(
                    (type) => type.channel == row.channel,
                  );
                  return (
                    match && (
                      <div className='content-row' key={match.emoji}>
                        <div className='emoji'>
                          <span role='img' aria-label='row.emojiName'>
                            {match.emoji}
                          </span>
                        </div>
                        <div className='text'>
                          {`${
                            match.channel != Channel.NIGHTLY
                              ? 'Promoted to '
                              : 'Created as '
                          } ${this.getTitle(match.channel)} on ${moment
                            .tz(row.date, moment.tz.guess())
                            .format('MMMM Do, hA z')}`}
                        </div>
                      </div>
                    )
                  );
                })}
            </div>
          </div>
        </div>
      </div>
    );
  }
}
