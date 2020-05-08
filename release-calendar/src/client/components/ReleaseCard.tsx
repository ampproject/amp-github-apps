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
import {channelTitles} from './ChannelTable';
import moment from 'moment-timezone';

interface History {
  [key: string]: {title: string; emoji: string; emojiName: string};
}

export interface ReleaseCardProps {
  title: string;
  className: string;
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
    const release = await this.apiService.getRelease(this.props.title);
    this.setState({releaseDates: release.promotions});
  }

  history: History = {
    [Channel.NIGHTLY]: {
      title: channelTitles[Channel.NIGHTLY].title,
      emoji: '🌙',
      emojiName: 'moon',
    },
    [Channel.OPT_IN_EXPERIMENTAL]: {
      title: `${channelTitles[Channel.OPT_IN_EXPERIMENTAL].title}, ${
        channelTitles[Channel.OPT_IN_BETA].title
      }`,
      emoji: '✋',
      emojiName: 'hand',
    },
    [Channel.PERCENT_EXPERIMENTAL]: {
      title: `${channelTitles[Channel.PERCENT_EXPERIMENTAL].title}, ${
        channelTitles[Channel.PERCENT_BETA].title
      }`,
      emoji: '🧪',
      emojiName: 'experiment',
    },
    [Channel.STABLE]: {
      title: channelTitles[Channel.STABLE].title,
      emoji: '🏠',
      emojiName: 'house',
    },
    [Channel.LTS]: {
      title: channelTitles[Channel.LTS].title,
      emoji: '🏙️',
      emojiName: 'city',
    },
  };

  render(): JSX.Element {
    return (
      <div className='event-card'>
        <div className={this.props.className}>
          <div className='event-top'></div>
          <div className='event-content'>
            <div className='content-row'>
              <div className='big-emoji'>
                <span role='img' aria-label='train'>
                  {'🚄'}
                </span>
              </div>
              <h2 className='title-row'>{`Release ${this.props.title}`}</h2>
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
                    href={`https://github.com/ampproject/amphtml/releases/tag/${this.props.title}`}
                    target='_blank'
                    rel='noopener noreferrer'>
                    {'GitHub Release'}
                  </a>
                </div>
              </div>
              <h3 className='subtitle-row'>{'Release History'}</h3>
              {this.state.releaseDates &&
                this.state.releaseDates.map((row) => {
                  const match = this.history[row.channel];
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
                            row.channel != Channel.NIGHTLY
                              ? 'Promoted to '
                              : 'Created as '
                          } ${match.title} on ${moment
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
