/**
 * Copyright 2019 The AMP HTML Authors.
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

const sinon = require('sinon');

const AbstractFileCache = require('../../src/cache/abstract_file_cache');

describe('abstract file cache', () => {
  const sandbox = sinon.createSandbox();
  let cache;
  let getContents;

  beforeEach(() => {
    sandbox.stub(console);
    cache = new AbstractFileCache();
    getContents = sinon.spy(async () => 'OWNERS file contents');
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe('readFile', () => {
    it('throws an error', () => {
      expect(cache.readFile('foo/OWNERS', getContents)).rejects.toThrow(
        'Not implemented'
      );
    });
  });

  describe('invalidate', () => {
    it('throws an error', () => {
      expect(cache.invalidate('foo/OWNERS')).rejects.toThrow('Not implemented');
    });
  });
});
