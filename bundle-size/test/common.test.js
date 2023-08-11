/**
 * Copyright 2022 The AMP HTML Authors. All Rights Reserved.
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

const {sortBundleSizeItems} = require('../common');

describe('bundle-size common', () => {
  describe('sortBundleSizeItems', () => {
    it('sorts desc', async () => {
      expect(
        sortBundleSizeItems(
          [
            {file: 'bar.js', bundleSizeDelta: -0.1},
            {file: 'foo.js', bundleSizeDelta: 0.1},
          ],
          'desc'
        )
      ).toEqual([
        {file: 'foo.js', bundleSizeDelta: 0.1},
        {file: 'bar.js', bundleSizeDelta: -0.1},
      ]);
    });
    it('sorts asc', async () => {
      expect(
        sortBundleSizeItems(
          [
            {file: 'foo.js', bundleSizeDelta: 0.1},
            {file: 'bar.js', bundleSizeDelta: -0.1},
          ],
          'asc'
        )
      ).toEqual([
        {file: 'bar.js', bundleSizeDelta: -0.1},
        {file: 'foo.js', bundleSizeDelta: 0.1},
      ]);
    });
    it('groups by filename without extension desc', async () => {
      expect(
        sortBundleSizeItems(
          [
            {file: 'bar.js', bundleSizeDelta: -0.1},
            {file: 'foo.js', bundleSizeDelta: 0.15},
            {file: 'baz.js', bundleSizeDelta: 0.05},
            {file: 'baz.mjs', bundleSizeDelta: 0.08},
            {file: 'bar.mjs', bundleSizeDelta: 0.2},
            {file: 'foo.mjs', bundleSizeDelta: 0.1},
          ],
          'desc'
        )
      ).toEqual([
        {file: 'bar.mjs', bundleSizeDelta: 0.2},
        {file: 'bar.js', bundleSizeDelta: -0.1},
        {file: 'foo.js', bundleSizeDelta: 0.15},
        {file: 'foo.mjs', bundleSizeDelta: 0.1},
        {file: 'baz.mjs', bundleSizeDelta: 0.08},
        {file: 'baz.js', bundleSizeDelta: 0.05},
      ]);
    });
    it('groups by filename without extension asc', async () => {
      expect(
        sortBundleSizeItems(
          [
            {file: 'bar.js', bundleSizeDelta: -0.1},
            {file: 'foo.js', bundleSizeDelta: 0.15},
            {file: 'baz.js', bundleSizeDelta: 0.05},
            {file: 'baz.mjs', bundleSizeDelta: 0.08},
            {file: 'bar.mjs', bundleSizeDelta: 0.2},
            {file: 'foo.mjs', bundleSizeDelta: 0.1},
          ],
          'asc'
        )
      ).toEqual([
        {file: 'bar.js', bundleSizeDelta: -0.1},
        {file: 'bar.mjs', bundleSizeDelta: 0.2},
        {file: 'baz.js', bundleSizeDelta: 0.05},
        {file: 'baz.mjs', bundleSizeDelta: 0.08},
        {file: 'foo.mjs', bundleSizeDelta: 0.1},
        {file: 'foo.js', bundleSizeDelta: 0.15},
      ]);
    });
  });
});
