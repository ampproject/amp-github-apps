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
const {
  CloudStorageCache,
  CompoundCache,
  MemoryCache,
} = require('../src/file_cache');

describe('file caches', () => {
  const sandbox = sinon.createSandbox();
  let getContents;

  beforeEach(() => {
    getContents = sinon.spy(async () => 'OWNERS file contents');
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe('Cloud Storage-backed', () => {
    let cache;

    beforeEach(() => {
      cache = new CloudStorageCache('my-storage-bucket');
    });

    describe('readFile', () => {
      describe('when the file is in the cache', () => {
        beforeEach(() => {
          sandbox
            .stub(CloudStorage.prototype, 'download')
            .returns('OWNERS file contents');
        });

        it('downloads and returns the file contents', async () => {
          const contents = await cache.readFile('foo/OWNERS', getContents);

          expect(contents).toEqual('OWNERS file contents');
          sandbox.assert.calledWith(cache.storage.download, 'foo/OWNERS');
        });

        it('does not get the contents from the provided method', async done => {
          await cache.readFile('foo/OWNERS', getContents);
          sandbox.assert.notCalled(getContents);
          done();
        });
      });

      describe('when the file is not in the cache', () => {
        const getContents = sinon.spy(async () => 'OWNERS file contents');

        beforeEach(() => {
          sandbox
            .stub(CloudStorage.prototype, 'download')
            .returns(Promise.reject(new Error('Not found!')));
          sandbox.stub(CloudStorage.prototype, 'upload').resolves();
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
            'OWNERS file contents'
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

  describe('memory-backed', () => {
    let cache;

    beforeEach(() => {
      cache = new MemoryCache();
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

  describe('compound', () => {
    let cache;

    beforeEach(() => {
      cache = new CompoundCache('my-storage-bucket');
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
        sandbox.assert.calledWith(
          MemoryCache.prototype.invalidate,
          'foo/OWNERS'
        );
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
});
