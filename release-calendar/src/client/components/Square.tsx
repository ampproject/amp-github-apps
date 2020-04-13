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
import '../stylesheets/square.scss'

export interface SquareProps {
  channel: string;
  selected: boolean;
}
export class Square extends React.Component<SquareProps, {}> {

  getSquareClassNames(): string{
    if (this.props.selected) {
        return 'selected';
    } 
    return 'unselected';
}   

  render(): JSX.Element {
    return (
      <div className={this.getSquareClassNames()}>
        <input type='radio' id={this.props.channel} className={this.props.channel} style={{outline: 'none'}}>
          {' '}
        </input>
      </div>
    );
  }
}
