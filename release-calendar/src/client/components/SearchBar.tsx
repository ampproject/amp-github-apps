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

export interface SearchBarProps {
    handleSearch: (searchValue: string) => void;
    searchedValue: string;
}
export class SearchBar extends React.Component<SearchBarProps, {}> {
    constructor(props: Readonly<SearchBarProps>) {
      super(props)
      this.state= {
        otherPlace: 'searched',
      };
    }
  handleSearchValueChange = (): void => {
    this.props.handleSearch(this.props.searchedValue);            
}
    render(): JSX.Element {
      return ( 
<form>
              <label>
             Search for RTV:
           <input type="text" name= "search for RTV" value={this.props.searchedValue} onChange={this.handleSearchValueChange}/>
                </label>
                <input type="submit" value="Submit" />
              </form>
      )}}

