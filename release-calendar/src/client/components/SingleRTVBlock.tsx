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

export interface SingleRTVBlockProps {
  RTV: string;
}

export class SingleRTVBlock extends React.Component<SingleRTVBlockProps, {}> {
  render(): JSX.Element {
    const RTV = this.props.RTV;
    return (
      <tr>
        <ul> {'Selected RTV: ' + RTV} </ul>
        <ul>{'Release Inforamtion... blah blah'}</ul>
        <ul>{'blah blah blah'}</ul>
        <ul>{'blah blah'}</ul>
        <ul>{'blah'}</ul>
      </tr>
    );
  }
}
