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

const {GitHub} = require('../../src/api/github');
const VirtualRepository = require('../../src/repo/virtual_repo');
const CompoundCache = require('../../src/cache/compound_cache');
const CloudStorage = require('../../src/api/cloud_storage');
const sinon = require('sinon');

describe('virtual repository', () => {
  const sandbox = sinon.createSandbox();
  const github = new GitHub({}, 'ampproject', 'amphtml', console);
  let repo;

  beforeEach(() => {
    const cache = new CompoundCache('my-bucket-name');
    repo = new VirtualRepository(github, cache);

    sandbox
      .stub(CloudStorage.prototype, 'download')
      .rejects(new Error('Not found'));
    sandbox.stub(CloudStorage.prototype, 'upload').resolves();
    sandbox.stub(CloudStorage.prototype, 'delete');
    sandbox.stub(console);

    sandbox
      .stub(GitHub.prototype, 'searchFilename')
      .withArgs('OWNERS')
      .onFirstCall()
      .returns([
        {filename: 'OWNERS', sha: 'sha_1'},
        {filename: 'foo/OWNERS', sha: 'sha_2'},
      ])
      .onSecondCall()
      .returns([
        {filename: 'OWNERS', sha: 'sha_updated'},
        {filename: 'foo/OWNERS', sha: 'sha_2'},
      ]);
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe('sync', () => {
    it('fetches the list of owners files', async done => {
      sandbox.stub(VirtualRepository.prototype, 'findOwnersFiles');
      await repo.sync();

      sandbox.assert.calledOnce(repo.findOwnersFiles);
      done();
    });
  });

  describe('readFile', () => {
    it('throws an error for unknown files', () => {
      expect(repo.readFile('OWNERS')).rejects.toThrowError(
        'File "OWNERS" not found in virtual repository'
      );
    });

    describe('for files found through findOwnersFiles', () => {
      beforeEach(() => {
        sandbox.stub(GitHub.prototype, 'getFileContents').returns('contents');
      });

      it('fetches the file contents from GitHub', async () => {
        expect.assertions(1);
        await repo.findOwnersFiles();
        const contents = await repo.readFile('OWNERS');

        sandbox.assert.calledWith(github.getFileContents, {
          filename: 'OWNERS',
          sha: 'sha_1',
        });
        expect(contents).toEqual('contents');
      });

      it('returns the file from the cache when available', async () => {
        expect.assertions(1);
        await repo.findOwnersFiles();
        await repo.readFile('OWNERS');
        await repo.readFile('OWNERS');
        await repo.readFile('OWNERS');
        await repo.readFile('OWNERS');
        const contents = await repo.readFile('OWNERS');

        sandbox.assert.calledOnce(github.getFileContents);
        expect(contents).toEqual('contents');
      });

      it('re-fetches the file when the cache is invalidated', async () => {
        expect.assertions(1);

        await repo.findOwnersFiles();
        await repo.readFile('OWNERS');
        sandbox.assert.calledWith(github.getFileContents, {
          filename: 'OWNERS',
          sha: 'sha_1',
        });

        await repo.cache.invalidate('OWNERS');
        const contents = await repo.readFile('OWNERS');
        sandbox.assert.calledTwice(github.getFileContents);

        expect(contents).toEqual('contents');
      });

      it('executes the callback for cache misses', async () => {
        expect.assertions(1);

        const cacheMissCallback = sandbox.spy();
        await repo.findOwnersFiles();
        const contents = await repo.readFile('OWNERS', cacheMissCallback);

        sandbox.assert.calledOnce(cacheMissCallback);
        expect(contents).toEqual('contents');
      });

      it('ignores the callback for files in the cache', async () => {
        expect.assertions(1);

        const cacheMissCallback = sandbox.spy();
        await repo.findOwnersFiles();
        await repo.readFile('OWNERS');
        const contents = await repo.readFile('OWNERS', cacheMissCallback);

        sandbox.assert.notCalled(cacheMissCallback);
        expect(contents).toEqual('contents');
      });
    });
  });

  describe('findOwnersFiles', () => {
    it('returns the owners file names', async () => {
      expect.assertions(1);
      const ownersFiles = await repo.findOwnersFiles();
      expect(ownersFiles).toEqual(['OWNERS', 'foo/OWNERS']);
    });

    it('records new owners files', async () => {
      expect.assertions(2);
      await repo.findOwnersFiles();

      expect(repo._fileRefs.get('OWNERS')).toEqual('sha_1');
      expect(repo._fileRefs.get('foo/OWNERS')).toEqual('sha_2');
    });

    it('updates changed owners files', async () => {
      expect.assertions(2);

      await repo.findOwnersFiles();
      // Pretend the contents for the known files have been fetched
      repo._fileRefs.get('OWNERS').contents = 'old root contents';
      repo._fileRefs.get('foo/OWNERS').contents = 'old foo contents';
      await repo.findOwnersFiles();

      expect(repo._fileRefs.get('OWNERS')).toEqual('sha_updated');
      expect(repo._fileRefs.get('foo/OWNERS')).toEqual('sha_2');
    });

    it('invalidates the cache for changed owners files', async done => {
      sandbox.stub(CompoundCache.prototype, 'invalidate');
      await repo.findOwnersFiles();
      sandbox.assert.notCalled(repo.cache.invalidate);

      await repo.findOwnersFiles();
      sandbox.assert.calledWith(repo.cache.invalidate, 'OWNERS');
      done();
    });
  });
});
