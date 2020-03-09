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
    const channel = this.props.channel;
    const RTV = this.props.RTV;
    const enlarge = this.props.isDisplayed;
    if (enlarge) {
      return (
        <tr>
          <td> {'clicked on'}</td>
          <td>{channel}</td>
          <td>{RTV}</td>
        </tr>
      );
    } else {
      return (
        <tr>
          <td>{channel}</td>
          <td>{RTV}</td>
        </tr>
      );
    }
  }
}
