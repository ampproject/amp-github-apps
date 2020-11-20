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

import {EventApi, ViewApi} from '@fullcalendar/core';
import {Hook} from './Hook';
import React from 'react';
import ReactDOM from 'react-dom';

export const Tooltip = (arg: {
  isMirror: boolean;
  isStart: boolean;
  isEnd: boolean;
  event: EventApi;
  el: HTMLElement;
  view: ViewApi;
}): void => {
  const Content = (): JSX.Element => {
    return (
      <Hook title={arg.event.title} className={arg.event.classNames[0]}></Hook>
    );
  };

  ReactDOM.render(<Content />, arg.el);
};
