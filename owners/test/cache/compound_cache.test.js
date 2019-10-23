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

const {CloudStorage} = require('../../src/cloud_storage');
const CompoundCache = require('../../src/cache/compound_cache');
const CloudStorageCache = require('../../src/cache/cloud_storage_cache');
const MemoryCache = require('../../src/cache/memory_cache');

describe('compound cache', () => {
  const sandbox = sinon.createSandbox();
  let cache;
  let getContents;

  beforeEach(() => {
    sandbox.stub(console);
    cache = new CompoundCache('my-storage-bucket');
    getContents = sinon.spy(async () => 'OWNERS file contents');
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe('readFile', () => {
    describe('when the file is in the memory cache', () => {
      beforeEach(() => {
        cache.memoryCache.files.set('foo/OWNERS', 'OWNERS file contents');
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

    describe('when the file is not in the memory cache', () => {
      describe('when the file is in the Cloud Storage cache', async () => {
        beforeEach(() => {
          sandbox
            .stub(CloudStorage.prototype, 'download')
            .returns('OWNERS file contents');
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

        it('saves the contents to the memory cache', async () => {
          expect.assertions(1);
          await cache.readFile('foo/OWNERS', getContents);

          expect(cache.memoryCache.files.get('foo/OWNERS')).toEqual(
            'OWNERS file contents'
          );
        });
      });

      describe('when the file is not in the Cloud Storage cache', async () => {
        beforeEach(() => {
          sandbox.stub(CloudStorage.prototype, 'upload').resolves();
          sandbox
            .stub(CloudStorage.prototype, 'download')
            .returns(Promise.reject(new Error('Not found!')));
        });

        it('returns the file contents', async () => {
          const contents = await cache.readFile('foo/OWNERS', getContents);
          expect(contents).toEqual('OWNERS file contents');
        });

        it('calls the provided method to get the file contents', async done => {
          await cache.readFile('foo/OWNERS', getContents);
          sandbox.assert.calledOnce(getContents);
          done();
        });

        it('saves the contents to the memory cache', async () => {
          expect.assertions(1);
          await cache.readFile('foo/OWNERS', getContents);

          expect(cache.memoryCache.files.get('foo/OWNERS')).toEqual(
            'OWNERS file contents'
          );
        });

        it('saves the contents to the Cloud Storage cache', async done => {
          await cache.readFile('foo/OWNERS', getContents);

          sandbox.assert.calledWith(
            cache.cloudStorageCache.storage.upload,
            'foo/OWNERS',
            'OWNERS file contents'
          );
          done();
        });
      });
    });
  });

  describe('invalidate', () => {
    beforeEach(() => {
      sandbox.stub(MemoryCache.prototype, 'invalidate');
      sandbox.stub(CloudStorageCache.prototype, 'invalidate');
    });

    it('invalidates the memory cache', async done => {
      await cache.invalidate('foo/OWNERS');
      sandbox.assert.calledWith(MemoryCache.prototype.invalidate, 'foo/OWNERS');
      done();
    });

    it('invalidates the Cloud Storage cache', async done => {
      await cache.invalidate('foo/OWNERS');
      sandbox.assert.calledWith(
        CloudStorageCache.prototype.invalidate,
        'foo/OWNERS'
      );
      done();
    });
  });
});
