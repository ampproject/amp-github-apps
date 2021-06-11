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

import {ReleaseCard} from './ReleaseCard';
import {usePopper} from 'react-popper';
import React from 'react';
import ReactDOM from 'react-dom';

const TOOLTIP_HEIGHT = 300;

export const Hook = (children: {
  title: string;
  className: string;
}): JSX.Element => {
  const [referenceElement, setReferenceElement] = React.useState(null);
  const [popperElement, setPopperElement] = React.useState(null);
  const [isClicked, setClick] = React.useState(false);
  const node = React.useRef(null);
  const {styles, attributes} = usePopper(referenceElement, popperElement, {
    placement: 'left-end',
    strategy: 'absolute',
    modifiers: [
      {
        name: 'offset',
        options: {
          offset: [-(TOOLTIP_HEIGHT / 2), 5],
        },
      },
      {
        name: 'flip',
        options: {
          flipVariations: false,
        },
      },
      {
        name: 'eventListeners',
        options: {
          scroll: false,
        },
      },
    ],
  });

  const handleClickOutside = (event: MouseEvent): void => {
    if (node.current && !node.current.contains(event.target)) {
      setClick(false);
    }
  };

  React.useEffect(() => {
    document.addEventListener('mousedown', handleClickOutside);
    return (): void => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  return (
    <React.Fragment>
      <button
        className='event-button'
        ref={setReferenceElement}
        onClick={(): void => setClick(!isClicked)}>
        {children.title}
      </button>
      {ReactDOM.createPortal(
        <div ref={node}>
          <div
            ref={setPopperElement}
            style={{...{zIndex: 999}, ...styles.popper}}
            {...attributes.popper}>
            {isClicked && (
              <ReleaseCard
                title={children.title}
                className={children.className}></ReleaseCard>
            )}
          </div>
        </div>,
        document.querySelector('#app'),
      )}
    </React.Fragment>
  );
};
