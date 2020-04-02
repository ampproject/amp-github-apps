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

import '../stylesheets/square.scss';
import * as React from 'react';

export interface SquareProps {
  // TODO: considering moving the RTVs out of the ChannelTable Component altogether and
  // intead having them live directly next door. Still testing.
  channel: string;
  selected: boolean;
}
export class Square extends React.Component<SquareProps, {}> {
  render(): JSX.Element {
    if (this.props.selected) {
      return (
        <div className='square'>
          <button className={this.props.channel} style={{outline: 'none'}}>
            <div className='selected'> </div>
          </button>
        </div>
      );
    }
    return (
      <div className='square'>
        <button
          className={this.props.channel}
          style={{opacity: '50%', outline: 'none'}}>
          {' '}
        </button>
      </div>
    );
  }
}
