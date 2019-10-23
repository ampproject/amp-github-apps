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
const MemoryCache = require('../../src/cache/memory_cache');

describe('in-memory file cache', () => {
  const sandbox = sinon.createSandbox();
  let cache;
  let getContents;

  beforeEach(() => {
    sandbox.stub(console);
    cache = new MemoryCache();
    getContents = sinon.spy(async () => 'OWNERS file contents');
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe('readFile', () => {
    describe('when the file is in the cache', () => {
      beforeEach(() => {
        cache.files.set('foo/OWNERS', 'OWNERS file contents');
      });

      it('returns the file contents', async () => {
        const contents = await cache.readFile('foo/OWNERS', getContents);
        expect(contents).toEqual('OWNERS file contents');
      });

      it('does not get the contents from the provided method', async done => {
        await cache.readFile('foo/OWNERS', getContents);
        sandbox.assert.notCalled(getContents);
        done();
      });
    });

    describe('when the file is not in the cache', () => {
      it('calls the provided method to get the file contents', async () => {
        expect.assertions(1);
        const contents = await cache.readFile('foo/OWNERS', getContents);

        expect(contents).toEqual('OWNERS file contents');
        sandbox.assert.calledOnce(getContents);
      });

      it('saves the contents to the cache', async () => {
        expect.assertions(1);
        await cache.readFile('foo/OWNERS', getContents);

        expect(cache.files.get('foo/OWNERS')).toEqual('OWNERS file contents');
      });
    });
  });

  describe('invalidate', () => {
    it('deletes the invalidated file cache from memory', async () => {
      expect.assertions(1);
      cache.files.set('foo/OWNERS', 'outdated file contents');
      await cache.invalidate('foo/OWNERS');

      expect(cache.files.has('foo/OWNERS')).toBe(false);
    });
  });
});
