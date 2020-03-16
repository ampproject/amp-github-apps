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
import {SearchBar} from './SearchBar';

interface AppState {
  searchedValue: string;
}

export class App extends React.Component<{}, AppState> {
  constructor(props: unknown) {
    super(props);
    this.state = {
      searchedValue: '',
    };
  }

  handleSearch = (searchValue: string): void => {
    this.setState({searchedValue: searchValue});
  };

  render(): JSX.Element {
    return (
      <div className='AMP-Release-Calender'>
        <div className='AMP-Release-Calendar-Header'>
          <Header title='AMP Release Calendar' />
          <SearchBar handleSearch={this.handleSearch} />
          {/* TODO: remove the line below later */}
          <h4>this is what was searched: + {this.state.searchedValue}</h4>
        </div>
      </div>
    );
  }
}
