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
import '../stylesheets/header.scss';
import * as React from 'react';

export interface HeaderProps {
  title: string;
}

export class Header extends React.Component<HeaderProps, {}> {
  render(): JSX.Element {
    return (
      <div className='head'>
        <div className='logo-container'>
          <svg id='logo' xmlns='http://www.w3.org/2000/svg'>
            <path
              fill='#FFF'
              d='M0 15c0 8.284 6.716 15 15 15 8.285 0 15-6.716 15-15 0-8.284-6.715-15-15-15C6.716 0 0 6.716 0 15z'></path>
            <path
              fill='#005AF0'
              fillRule='nonzero'
              d='M13.85 24.098h-1.14l1.128-6.823-3.49.005h-.05a.57.57 0 0 1-.568-.569c0-.135.125-.363.125-.363l6.272-10.46 1.16.005-1.156 6.834 3.508-.004h.056c.314 0 .569.254.569.568 0 .128-.05.24-.121.335L13.85 24.098zM15 0C6.716 0 0 6.716 0 15c0 8.284 6.716 15 15 15 8.285 0 15-6.716 15-15 0-8.284-6.715-15-15-15z'></path>
          </svg>
        </div>
        <div className='title'>{'AMP Release Calendar'}</div>
        <div className='search-bar'>{'TODO: Where the SearchBar will go'}</div>
      </div>
    );
  }
}
