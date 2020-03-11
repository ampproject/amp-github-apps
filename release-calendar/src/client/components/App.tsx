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

import * as React from 'react';
import {Header} from './Header';
import {Channel, CurrentRelease, RTVRowObject} from '../../types';
// import {event} from '@fullcalendar/core/structs/event';
import {ChannelTable} from './ChannelTable';
import {RTVTable} from './RTVTable';
import {FullCalendarCom} from './FullCalendarCom';
//import FullCalendar from '@fullcalendar/react';
const MODE = false;
const SELECTEDRTV = 'A single selected RTV';
const SELECTEDCHANEL = Channel.STABLE;
const FAKERTVANDGITHUBLINKS = [
  new RTVRowObject('RTVexample', 'githublink example'),
  new RTVRowObject('RTVexample', 'githublink example'),
  new RTVRowObject('RTVexample', 'githublink example'),
  new RTVRowObject('RTVexample', 'githublink example'),
  new RTVRowObject('RTVexample', 'githublink example'),
  new RTVRowObject('RTVexample', 'githublink example'),
];
const CURRENTRELEASES = [
  new CurrentRelease(Channel.LTS, 'RTVexample'),
  new CurrentRelease(Channel.STABLE, 'RTVexample'),
  new CurrentRelease(Channel.OPT_IN_BETA, 'RTVexample'),
  new CurrentRelease(Channel.OPT_IN_EXPERIMENTAL, 'RTVexample'),
  new CurrentRelease(Channel.PERCENT_BETA, 'RTVexample'),
  new CurrentRelease(Channel.PERCENT_EXPERIMENTAL, 'RTVexample'),
  new CurrentRelease(Channel.NIGHTLY, 'RTVexample'),
];
const FAKEEVENTS = [
  {
    events: [
      {
        title: 'event1',
        start: '2020-03-14',
      },
      {
        title: 'event2',
        start: '2020-03-10',
      },
      {
        title: 'event3',
        start: '2020-03-09T12:30:00',
      },
    ],
    color: 'black',
    textColor: 'yellow',
  },
  {
    events: [
      {
        title: 'event1',
        start: '2020-03-08',
      },
      {
        title: 'event2',
        start: '2020-03-07',
      },
      {
        title: 'event3',
        start: '2020-03-04T12:30:00',
      },
    ],
    color: 'blue',
    textColor: 'brown',
  },
];
export class App extends React.Component {
  calendarComponentRef = React.createRef();

  state = {
    calendarWeekends: true,
  };
  render(): JSX.Element {
    return (
      <div className="AMP-Release-Calendar">
        <div className="AMP-Release-Calendar-Header">
          <Header title="AMP Release Calendar" />
        </div>
        <div className="AMP-Release-Calendar-Side-Panel">
          <RTVTable
            mode={MODE}
            singleRTV={SELECTEDRTV}
            singleChannel={SELECTEDCHANEL}
            fakeData={FAKERTVANDGITHUBLINKS}
          />
          <ChannelTable currentReleases={CURRENTRELEASES} />
        </div>
        <div className="AMP-Release-Calendar-Full-Calendar">
          <FullCalendarCom events={FAKEEVENTS} />
        </div>
      </div>
    );
  }
}
