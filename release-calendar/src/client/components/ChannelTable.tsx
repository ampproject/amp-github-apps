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
import {ChannelRow} from './ChannelRow';
import {CurrentRelease} from '../../types';

export interface ChannelTableProps {
  currentReleases: CurrentRelease[];
}

export class ChannelTable extends React.Component<ChannelTableProps, {}> {
  render(): JSX.Element {
    const rows = [];
    const currentReleases = this.props.currentReleases;

    //change this for loop
    for (let i = 0; i < currentReleases.length; i++) {
      console.log(currentReleases[i]);
      rows.push(
        <ChannelRow
          channel={currentReleases[i].channel}
          RTV={currentReleases[i].RTV}
          isDisplayed={currentReleases[i].isDisplayed}
          key={i}></ChannelRow>,
      );
    }
    return (
      <table>
        <thead>Current Releases</thead>
        <tbody>{rows}</tbody>
      </table>
    );
  }
}
