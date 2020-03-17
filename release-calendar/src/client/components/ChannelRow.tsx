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

export interface ChannelRowProps {
  channel: string;
  RTV: string;
  isDisplayed: boolean;
}

export class ChannelRow extends React.Component<ChannelRowProps, {}> {
  render(): JSX.Element {
    if (this.props.isDisplayed) {
      return (
        //TODO(ajwhatson): change the format of the RTVTable and ColumnTable
        //to be similar once Material Design is added
        <thead>
          <tr>
            <th colSpan={3}>{'clicked on'}</th>
            <th colSpan={3}>{this.props.channel}</th>
            <th colSpan={3}>{this.props.RTV}</th>
          </tr>
        </thead>
      );
    } else {
      return (
        <thead>
          <tr>
            <th colSpan={3}>{this.props.channel}</th>
            <th colSpan={3}>{this.props.RTV}</th>
          </tr>
        </thead>
      );
    }
  }
}
