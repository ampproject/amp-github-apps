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

const nock = require('nock');
const sinon = require('sinon');

const {CloudStorage, CloudStorageCache} = require('../src/cloud_storage');

describe('cloud storage', () => {
  let sandbox;
  let storage;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    storage = new CloudStorage('my-storage-bucket');
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe('file', () => {
    it('provides a reference to a file in the storage bucket', () => {
      const file = storage.file('foo/OWNERS');

      expect(file.name).toEqual('foo/OWNERS');
      expect(file.bucket.name).toEqual('my-storage-bucket');
    });
  });

  describe('file operations', () => {
    let fileStub;

    beforeEach(() => {
      fileStub = sinon.stub(storage.file('foo/OWNERS'));
      sandbox.stub(CloudStorage.prototype, 'file').returns(fileStub);
    });

    describe('download', () => {
      it('downloads the file contents as a string', async () => {
        expect.assertions(1);
        fileStub.download.returns(['OWNERS file contents']);
        const contents = await storage.download('foo/OWNERS');

        expect(contents).toEqual('OWNERS file contents');
        sandbox.assert.calledWith(storage.file, 'foo/OWNERS');
        sandbox.assert.calledOnce(fileStub.download);
      });
    });

    describe('upload', () => {
      it('saves the file contents', async done => {
        await storage.upload('foo/OWNERS', 'OWNERS file contents');

        sandbox.assert.calledWith(storage.file, 'foo/OWNERS');
        sandbox.assert.calledWith(fileStub.save, 'OWNERS file contents', {
          resumable: false,
        });
        done();
      });
    });

    describe('delete', () => {
      it('deletes the requested file', async done => {
        await storage.delete('foo/OWNERS');

        sandbox.assert.calledWith(storage.file, 'foo/OWNERS');
        sandbox.assert.calledOnce(fileStub.delete);
        done();
      });
    });
  });
});

describe('cloud storage cache', () => {
  let sandbox;
  let cache;
  let fileStub;

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
      const getContents = sinon.spy(() => 'OWNERS file contents');

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
