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
import {SingleRTVBlock} from './SingleRTVBlock';
import {ManyRTVTable} from './ManyRTVTable';
import {RTVRowObject} from '../../types';

export interface RTVTableProps {
  mode: boolean;
  singleRTV: string;
  singleChannel: string;
  fakeData: RTVRowObject[];
}

export class RTVTable extends React.Component<RTVTableProps, {}> {
  render(): JSX.Element {
    const mode = this.props.mode;
    if (mode) {
      return <SingleRTVBlock RTV={this.props.singleRTV} />;
    } else {
      return (
        <ManyRTVTable
          channel={this.props.singleChannel}
          fakeData={this.props.fakeData}
        />
      );
    }
  }
}
