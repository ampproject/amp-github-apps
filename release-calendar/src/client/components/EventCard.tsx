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
import {Channel} from '../../types';
import {EventApi} from '@fullcalendar/core';
import moment from 'moment';

export interface EventCardProps {
  event: EventApi;
}

export class EventCard extends React.Component<EventCardProps, {}> {
  rows = [
    {channel: Channel.STABLE, title: 'Stable'},
    {channel: Channel.PERCENT_BETA, title: '% Beta'},
    {channel: Channel.PERCENT_EXPERIMENTAL, title: '% Experimental'},
    {channel: Channel.OPT_IN_BETA, title: 'Opt-in Beta'},
    {channel: Channel.OPT_IN_EXPERIMENTAL, title: 'Opt-in Experimental'},
    {channel: Channel.NIGHTLY, title: 'Nightly'},
    {channel: Channel.LTS, title: 'Long Term Stable'},
  ];

  render(): JSX.Element {
    return (
      <>
        <div className={'event-top'}>
          <br className={this.props.event.classNames[0]}></br>
        </div>
        <div className={'event-content'}>
          <div>{this.props.event.title}</div>
          <div>{moment(this.props.event.start).format('LT')}</div>
          <div>{moment(this.props.event.end).format('LT')}</div>
          <a
            href={
              'https://github.com/ampproject/amphtml/releases/tag/' +
              this.props.event.title
            }>
            {'to the github release body..'}
          </a>
        </div>
      </>
    );
  }
}
