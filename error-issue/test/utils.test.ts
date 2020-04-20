/**
 * Copyright 2020 The AMP HTML Authors.
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

import {
  formatDate,
  parsePrNumber,
  parseSource,
  parseStacktrace
} from '../src/utils';

describe('formatDate', () => {
  it('produces a short date format', () => {
    const d = new Date('Feb 25, 2020');
    expect(formatDate(d)).toEqual('Feb 25, 2020');
  });
});

describe('parsePrNumber', () => {
  it('parses the PR number from a commit message', () => {
    const prNumber = parsePrNumber('Commit message from a PR (#12345)');
    expect(prNumber).toEqual(12345);
  });

  it('returns 0 when the commit message contains no PR number', () => {
    const prNumber = parsePrNumber('Direct commit to master branch');
    expect(prNumber).toEqual(0);
  });
});

describe('parseSource', () => {
  it('parses the components of a standardized source URL:line string', () => {
    const source =
      'https://raw.githubusercontent.com/ampproject/amphtml/' +
      '2004030010070/extensions/amp-delight-player/0.1/amp-delight-player.js:421';
    const {rtv, path, line} = parseSource(source);

    expect(rtv).toEqual('2004030010070');
    expect(path).toEqual(
      'extensions/amp-delight-player/0.1/amp-delight-player.js'
    );
    expect(line).toEqual(421);
  });

  describe('non-standardized sources', () => {
    it.each([
      ['https://cdn.ampproject.org/rtv/2004030010070/v0.js:1337'],
      ['unexpected-token-js:1'],
      ['https://raw.githubusercontent.com/ampproject/amphtml/undefined'],
    ])('returns null for "%s"', source => {
      expect(parseSource(source)).toBeNull();
    });
  });
});

describe('parseStacktrace', () => {
  it('parses frames from a stacktrace string', () => {
    let frames = parseStacktrace(
      `Error: undefined is not an object (evaluating 'b.length')
        at length (https://raw.githubusercontent.com/ampproject/amphtml/2004030010070/extensions/amp-next-page/1.0/service.js:785)
        at queuePages_ (https://raw.githubusercontent.com/ampproject/amphtml/2004030010070/extensions/amp-next-page/1.0/service.js:294)`
    );
    expect(frames).toEqual([
      {
        rtv: '2004030010070',
        path: 'extensions/amp-next-page/1.0/service.js',
        line: 785,
      },
      {
        rtv: '2004030010070',
        path: 'extensions/amp-next-page/1.0/service.js',
        line: 294,
      },
    ]);

    frames = parseStacktrace(
      `Error: null is not an object (evaluating 'b.acceleration.x')
          at x (https://raw.githubusercontent.com/ampproject/amphtml/2004030010070/extensions/amp-delight-player/0.1/amp-delight-player.js:421:13)
          at event (https://raw.githubusercontent.com/ampproject/amphtml/2004030010070/src/event-helper-listen.js:58:27)`
    );
    expect(frames).toEqual([
      {
        rtv: '2004030010070',
        path: 'extensions/amp-delight-player/0.1/amp-delight-player.js',
        line: 421,
      },
      {
        rtv: '2004030010070',
        path: 'src/event-helper-listen.js',
        line: 58,
      },
    ]);
  });
});
