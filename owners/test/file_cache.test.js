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

const {CloudStorage} = require('../src/cloud_storage');
const {CloudStorageCache, MemoryCache} = require('../src/file_cache');

describe('cloud storage file cache', () => {
  let sandbox;
  let cache;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    cache = new CloudStorageCache('my-storage-bucket')
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe('readFile', () => {
    describe('when the file is in the cache', () => {
      beforeEach(() => {
        sandbox.stub(CloudStorage.prototype, 'download').returns(
          'OWNERS file contents'
        );
      });

      it('downloads and returns the file contents', async () => {
        const contents = await cache.readFile('foo/OWNERS');

        expect(contents).toEqual('OWNERS file contents');
        sandbox.assert.calledWith(cache.storage.download, 'foo/OWNERS');
      });
    });

    describe('when the file is not in the cache', () => {
      const getContents = sinon.spy(async () => 'OWNERS file contents');

      beforeEach(() => {
        sandbox.stub(CloudStorage.prototype, 'download').returns(
          Promise.reject('Not found!')
        );
        sandbox.stub(CloudStorage.prototype, 'upload');
      });

      it('calls the provided method to get the file contents', async () => {
        expect.assertions(1);
        const contents = await cache.readFile('foo/OWNERS', getContents);

        expect(contents).toEqual('OWNERS file contents');
        sandbox.assert.calledOnce(getContents);
      });

      it('saves the contents to the cache', async done => {
        await cache.readFile('foo/OWNERS', getContents);

        sandbox.assert.calledWith(
          cache.storage.upload,
          'foo/OWNERS',
          'OWNERS file contents',
        );
        done();
      });
    });
  });

  describe('invalidate', () => {
    it('deletes the invalidated file cache from storage', async done => {
      sinon.stub(CloudStorage.prototype, 'delete');
      await cache.invalidate('foo/OWNERS');

      sandbox.assert.calledWith(cache.storage.delete, 'foo/OWNERS');
      done();
    });
  });
});

describe('in-memory file cache', () => {
  let sandbox;
  let cache;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    cache = new MemoryCache();
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
        const contents = await cache.readFile('foo/OWNERS');
        expect(contents).toEqual('OWNERS file contents');
      });
    });

    describe('when the file is not in the cache', () => {
      const getContents = sinon.spy(async () => 'OWNERS file contents');

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
      cache.files.set('foo/OWNERS', 'outdated file contents')
      await cache.invalidate('foo/OWNERS');

      expect(cache.files.has('foo/OWNERS')).toBe(false);
    });
  });
});
