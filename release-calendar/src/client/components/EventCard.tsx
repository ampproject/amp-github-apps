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
import {EventApi} from '@fullcalendar/core';
import moment from 'moment';

export interface EventCardProps {
  eventApi: EventApi;
}

export class EventCard extends React.Component<EventCardProps, {}> {
  //TODO: use readable channel titles in eventCard

  content = [
    {icon: 'pageview', text: this.props.eventApi.title},
    {
      icon: 'alarm_on',
      text:
        'entered channel at ' +
        moment(this.props.eventApi.start).format('MMMM Do, hA'),
    },
    {
      icon: 'alarm_off',
      text:
        'left channel at ' +
        moment(this.props.eventApi.end).format('MMMM Do, hA'),
    },
  ];

  render(): JSX.Element {
    return (
      <div className={'event-card'}>
        <div
          className={this.props.eventApi.classNames[0]}
          style={{
            borderTopLeftRadius: '5px',
            borderTopRightRadius: '5px',
            height: 'inherit',
          }}>
          <div className={'event-top'}></div>
          <div className={'event-content'}>
            {this.content.map((row) => {
              return (
                <div className={'content-row'} key={row.icon}>
                  <div className={'icon'}>
                    <i
                      className='material-icons'
                      style={{lineHeight: 'inherit'}}>
                      {row.icon}
                    </i>
                  </div>
                  <div className={'text'}>{row.text}</div>
                </div>
              );
            })}
            <div className={'content-row'}>
              <div className={'icon'}>
                <i className='material-icons' style={{lineHeight: 'inherit'}}>
                  code
                </i>
              </div>
              <div className={'text'}>
                <a
                  href={
                    'https://github.com/ampproject/amphtml/releases/tag/' +
                    this.props.eventApi.title
                  }
                  target='_blank'
                  rel='noopener noreferrer'>
                  {'to the github release body..'}
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
}
