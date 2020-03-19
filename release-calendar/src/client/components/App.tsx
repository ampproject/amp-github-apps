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
import {Calendar} from './Calendar';
//TODO: remove DATA and instead populate with data from ./test/development-data.ts
import {DATA} from '../models/data';
import {EventSourceInput} from '@fullcalendar/core/structs/event-source';
import {Header} from './Header';
import {getEvents} from '../models/release-event';

interface AppState {
  events: EventSourceInput[];
}

export class App extends React.Component<{}, AppState> {
  constructor(props: unknown) {
    super(props);
    this.state = {
      events: [],
    };
  }

  //TODO: change fetch API call to service
  componentDidMount(): void {
    Promise.resolve(getEvents(DATA)).then(result =>
      this.setState({events: result}),
    );
  }

  render(): JSX.Element {
    return (
      <div className='AMP-Release-Calendar'>
        <Header title='AMP Release Calendar' />
        <div className='AMP-Release-Calendar-Full-Calendar'>
          <Calendar events={this.state.events} />
        </div>
      </div>
    );
  }
}
