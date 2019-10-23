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
const CloudStorageCache = require('../../src/cache/cloud_storage_cache');

describe('Cloud Storage file cache', () => {
  const sandbox = sinon.createSandbox();
  let cache;
  let getContents;

  beforeEach(() => {
    sandbox.stub(console);
    cache = new CloudStorageCache('my-storage-bucket');
    getContents = sinon.spy(async () => 'OWNERS file contents');
  });

  afterEach(() => {
    sandbox.restore();
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
      });

      it('calls the provided method to get the file contents', async () => {
        expect.assertions(1);
        sandbox.stub(CloudStorage.prototype, 'upload').resolves();
        const contents = await cache.readFile('foo/OWNERS', getContents);

        expect(contents).toEqual('OWNERS file contents');
        sandbox.assert.calledOnce(getContents);
      });

      it('saves the contents to the cache', async done => {
        sandbox.stub(CloudStorage.prototype, 'upload').resolves();
        await cache.readFile('foo/OWNERS', getContents);

        sandbox.assert.calledWith(
          cache.storage.upload,
          'foo/OWNERS',
          'OWNERS file contents'
        );
        done();
      });

      it('reports errors uploading to the cache', async done => {
        sandbox.stub(cache.storage, 'upload').rejects(new Error('Not found'));
        await cache.readFile('foo/OWNERS', getContents);

        sandbox.assert.calledWith(
          console.error,
          'Error uploading "foo/OWNERS": Not found'
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
