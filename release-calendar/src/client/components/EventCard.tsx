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
  releaseDates: ReleaseDates;
}

export class EventCard extends React.Component<EventCardProps, EventCardState> {
  private apiService: ApiService;

  constructor(props: Readonly<EventCardProps>) {
    super(props);
    this.state = {
      releaseDates: null,
    };
    this.apiService = new ApiService();
  }
  async componentDidMount(): Promise<void> {
    const releaseDates: ReleaseDates = await this.apiService.getReleaseDates(
      this.props.eventApi.title,
    );
    this.setState({releaseDates});
  }

  schedule = [
    {
      channel: Channel.NIGHTLY,
      text: 'Created as Nightly on ',
      emoji: '🌙',
      emojiName: 'moon',
    },
    {
      channel: Channel.OPT_IN_EXPERIMENTAL,
      text: 'Promoted to Opt-in Experimental, Opt-In Beta on ',
      emoji: '✋',
      emojiName: 'hand',
    },
    {
      channel: Channel.PERCENT_EXPERIMENTAL,
      text: 'Promoted to 1% Experimental, 1% Beta on ',
      emoji: '🧪',
      emojiName: 'experiment',
    },
    {
      channel: Channel.STABLE,
      text: 'Promoted to Stable on ',
      emoji: '🏠',
      emojiName: 'house',
    },
    {
      channel: Channel.LTS,
      text: 'Promoted to LTS on ',
      emoji: '🏙️',
      emojiName: 'city',
    },
  ];

  render(): JSX.Element {
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
              {/* TODO: uncomment below when cherrypick is connected 
              (will be adding cherrypick attribute to releaseDates) */}
              {/* {this.state.releaseDates.cherrypick && (
                <div className={'content-row'}>
                  <div className={'emoji'}>
                    <span role='img' aria-label={'flower'}>
                      {'🌸'}
                    </span>
                  </div>
                  <div className={'text'}>{'Cherrypick!'}</div>
                </div>
              )} */}
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
                    {'GitHub Release'}
                  </a>
                </div>
              </div>
              <h3 className={'subtitle-row'}>{'Schedule'}</h3>
              {this.state.releaseDates != null &&
                this.state.releaseDates.dates.map((row) => {
                  const match = this.schedule.find(
                    (type) => type.channel == row.channel,
                  );
                  return (
                    match && (
                      <div className={'content-row'} key={match.emoji}>
                        <div className={'emoji'}>
                          <span role='img' aria-label={'row.emojiName'}>
                            {match.emoji}
                          </span>
                        </div>
                        <div className={'text'}>
                          {match.text + moment(row.date).format('MMMM Do, hA')}
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
