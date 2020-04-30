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

import '../stylesheets/eventCard.scss';
import * as React from 'react';
import {ApiService} from '../api-service';
import {Channel} from '../../types';
import {EventApi} from '@fullcalendar/core';
import {ReleaseDates} from '../models/view-models';
import moment from 'moment';

export interface EventCardProps {
  eventApi: EventApi;
}

interface EventCardState {
  releaseDates: ReleaseDates[];
}

export class EventCard extends React.Component<EventCardProps, EventCardState> {
  private apiService: ApiService;

  constructor(props: Readonly<EventCardProps>) {
    super(props);
    this.state = {
      releaseDates: [],
    };
    this.apiService = new ApiService();
  }
  async componentDidMount(): Promise<void> {
    const releaseDates: ReleaseDates[] = await this.apiService.getReleaseDates(
      this.props.eventApi.title,
    );
    this.setState({releaseDates});
  }

  schedule = [
    {
      channel: Channel.NIGHTLY,
      text: 'Created as Nightly on ',
      title: 'Nightly',
      emoji: '🌙',
      emojiName: 'moon',
    },
    {
      channel: Channel.OPT_IN_EXPERIMENTAL,
      text: 'Promoted to Opt-in Experimental, Opt-In Beta on ',
      title: 'Opt-in Experimental',
      emoji: '✋',
      emojiName: 'hand',
    },
    {
      channel: Channel.PERCENT_EXPERIMENTAL,
      text: 'Promoted to 1% Experimental, 1% Beta on ',
      title: '1% Experimental',
      emoji: '🧪',
      emojiName: 'experiment',
    },
    {
      channel: Channel.STABLE,
      text: 'Promoted to Stable on ',
      title: 'Stable',
      emoji: '🏠',
      emojiName: 'house',
    },
    {
      channel: Channel.LTS,
      text: 'Promoted to LTS on ',
      title: 'Long Term Stable',
      emoji: '🏙️',
      emojiName: 'city',
    },
  ];

  render(): JSX.Element {
    const isCherryPick = true;
    return (
      <div className={'event-card'}>
        <div className={this.props.eventApi.classNames[0]}>
          <div className={'event-top'}></div>
          <div className={'event-content'}>
            <div className='content-row'>
              <div className={'big-emoji'}>
                <span role='img' aria-label={'train'}>
                  {'🚄'}
                </span>
              </div>
              <h2
                className={
                  'title-row'
                }>{`Release ${this.props.eventApi.title}`}</h2>
            </div>
            <div className='content-content'>
              {isCherryPick && (
                <div className={'content-row'}>
                  <div className={'emoji'}>
                    <span role='img' aria-label={'flower'}>
                      {'🌸'}
                    </span>
                  </div>
                  <div className={'text'}>{'Cherrypick!'}</div>
                </div>
              )}
              <div className={'content-row'}>
                <div className={'emoji'}>
                  <span role='img' aria-label={'laptop'}>
                    {'🖥'}
                  </span>
                </div>
                <div className={'text'}>
                  <a
                    href={`https://github.com/ampproject/amphtml/releases/tag/${this.props.eventApi.title}`}
                    target='_blank'
                    rel='noopener noreferrer'>
                    {'Github Release'}
                  </a>
                </div>
              </div>
              <h3 className={'subtitle-row'}>{'Schedule'}</h3>
              {this.schedule.map((row) => {
                const index = this.state.releaseDates.findIndex(
                  (releaseDate) => releaseDate.channel == row.channel,
                );
                return (
                  index != -1 && (
                    <div className={'content-row'} key={row.emoji}>
                      <div className={'emoji'}>
                        <span role='img' aria-label={'row.emojiName'}>
                          {row.emoji}
                        </span>
                      </div>
                      <div className={'text'}>
                        {row.text +
                          moment(this.state.releaseDates[index].start).format(
                            'MMMM Do, hA',
                          )}
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
