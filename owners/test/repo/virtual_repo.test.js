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

const CloudStorage = require('../../src/api/cloud_storage');
const CompoundCache = require('../../src/cache/compound_cache');
const sinon = require('sinon');
const VirtualRepository = require('../../src/repo/virtual_repo');
const {GitHub} = require('../../src/api/github');

describe('virtual repository', () => {
  const sandbox = sinon.createSandbox();
  const github = new GitHub({}, 'test_owner', 'test_repo', console);
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

    sandbox.stub(GitHub.prototype, 'getFileContents').resolves('contents');
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
      ])
      .onThirdCall()
      .returns([
        {filename: 'OWNERS', sha: 'sha_updated'},
        {filename: 'foo/OWNERS', sha: 'sha_2'},
      ]);
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe('sync', () => {
    it('records new owners files', async () => {
      expect.assertions(2);
      await repo.sync();

      expect(repo._fileRefs.get('test_repo/OWNERS')).toEqual('sha_1');
      expect(repo._fileRefs.get('test_repo/foo/OWNERS')).toEqual('sha_2');
    });

    it('updates changed owners files', async () => {
      expect.assertions(2);

      await repo.sync();
      // Pretend the contents for the known files have been fetched
      repo._fileRefs.get('test_repo/OWNERS').contents = 'old root contents';
      repo._fileRefs.get('test_repo/foo/OWNERS').contents = 'old foo contents';
      await repo.sync();

      expect(repo._fileRefs.get('test_repo/OWNERS')).toEqual('sha_updated');
      expect(repo._fileRefs.get('test_repo/foo/OWNERS')).toEqual('sha_2');
    });

    it('invalidates the cache for changed owners files', async done => {
      sandbox.stub(CompoundCache.prototype, 'invalidate');
      await repo.sync();
      sandbox.assert.neverCalledWith(repo.cache.invalidate, 'test_repo/OWNERS');

      await repo.sync();
      sandbox.assert.calledWith(repo.cache.invalidate, 'test_repo/OWNERS');
      done();
    });

    it('invalidates the file ref cache for new owners files', async done => {
      sandbox.stub(CompoundCache.prototype, 'invalidate').resolves();
      sandbox.stub(CompoundCache.prototype, 'readFile').resolves();
      await repo.sync();

      sandbox.assert.calledWith(
        repo.cache.invalidate,
        'test_repo/__fileRefs__'
      );
      sandbox.assert.calledWith(
        repo.cache.readFile,
        'test_repo/__fileRefs__',
        sinon.match.any
      );
      done();
    });

    it('invalidates the file ref cache for updated owners files', async done => {
      sandbox.stub(CompoundCache.prototype, 'invalidate').resolves();
      sandbox.stub(CompoundCache.prototype, 'readFile').resolves();
      await repo.sync();

      repo.cache.invalidate.resetHistory();
      repo.cache.readFile.resetHistory();
      await repo.sync();

      sandbox.assert.calledWith(
        repo.cache.invalidate,
        'test_repo/__fileRefs__'
      );
      sandbox.assert.calledWith(
        repo.cache.readFile,
        'test_repo/__fileRefs__',
        sinon.match.any
      );
      done();
    });

    it('does not touch the file ref cache for unchanged owners files', async done => {
      sandbox.stub(CompoundCache.prototype, 'invalidate').resolves();
      sandbox.stub(CompoundCache.prototype, 'readFile').resolves();
      await repo.sync();
      await repo.sync();

      repo.cache.invalidate.resetHistory();
      repo.cache.readFile.resetHistory();
      await repo.sync();

      sandbox.assert.neverCalledWith(
        repo.cache.invalidate,
        'test_repo/__fileRefs__'
      );
      sandbox.assert.neverCalledWith(
        repo.cache.readFile,
        'test_repo/__fileRefs__',
        sinon.match.any
      );
      done();
    });
  });

  describe('warmCache', () => {
    it('fetches file refs from GitHub', async () => {
      await repo.warmCache();

      sandbox.assert.calledWith(github.getFileContents.getCall(0), {
        filename: 'OWNERS',
        sha: 'sha_1',
      });
      sandbox.assert.calledWith(github.getFileContents.getCall(1), {
        filename: 'foo/OWNERS',
        sha: 'sha_2',
      });
    });

    describe('when file refs are in the cache', () => {
      beforeEach(() => {
        sandbox
          .stub(CompoundCache.prototype, 'readFile')
          .withArgs('test_repo/OWNERS', sinon.match.any)
          .resolves('')
          .withArgs('test_repo/foo/OWNERS', sinon.match.any)
          .resolves('')
          .withArgs('test_repo/__fileRefs__', sinon.match.any)
          .resolves(
            JSON.stringify([
              ['test_repo/OWNERS', 'sha_1'],
              ['test_repo/foo/OWNERS', 'sha_2'],
            ])
          );
      });

      it('reads file refs from the cache', async done => {
        await repo.warmCache();
        sandbox.assert.calledWith(
          repo.cache.readFile,
          'test_repo/__fileRefs__',
          sinon.match.any
        );
        done();
      });

      it('builds a map of file refs', async () => {
        expect.assertions(2);
        await repo.warmCache();

        expect(repo._fileRefs.get('test_repo/OWNERS')).toEqual('sha_1');
        expect(repo._fileRefs.get('test_repo/foo/OWNERS')).toEqual('sha_2');
      });

      it('reads all owners files through the cache', async done => {
        await repo.warmCache();

        sandbox.assert.calledWith(
          repo.cache.readFile,
          'test_repo/__fileRefs__',
          sinon.match.any
        );
        sandbox.assert.calledWith(
          repo.cache.readFile,
          'test_repo/OWNERS',
          sinon.match.any
        );
        sandbox.assert.calledWith(
          repo.cache.readFile,
          'test_repo/foo/OWNERS',
          sinon.match.any
        );
        done();
      });
    });
  });

  describe('readFile', () => {
    it('throws an error for unknown files', () => {
      expect(repo.readFile('OWNERS')).rejects.toThrowError(
        'File "test_repo/OWNERS" not found in virtual repository'
      );
    });

    describe('for files found through findOwnersFiles', () => {
      it('fetches the file contents from GitHub', async () => {
        expect.assertions(1);
        await repo.sync();
        const contents = await repo.readFile('OWNERS');

        sandbox.assert.calledWith(github.getFileContents, {
          filename: 'OWNERS',
          sha: 'sha_1',
        });
        expect(contents).toEqual('contents');
      });

      it('returns the file from the cache when available', async () => {
        expect.assertions(1);
        await repo.sync();
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

        await repo.sync();
        await repo.readFile('OWNERS');
        sandbox.assert.calledWith(github.getFileContents, {
          filename: 'OWNERS',
          sha: 'sha_1',
        });

        await repo.cache.invalidate('test_repo/OWNERS');
        const contents = await repo.readFile('OWNERS');
        sandbox.assert.calledTwice(github.getFileContents);

        expect(contents).toEqual('contents');
      });

      it('executes the callback for cache misses', async () => {
        expect.assertions(1);

        const cacheMissCallback = sandbox.spy();
        await repo.sync();
        const contents = await repo.readFile('OWNERS', cacheMissCallback);

        sandbox.assert.calledOnce(cacheMissCallback);
        expect(contents).toEqual('contents');
      });

      it('ignores the callback for files in the cache', async () => {
        expect.assertions(1);

        const cacheMissCallback = sandbox.spy();
        await repo.sync();
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
      await repo.sync();
      const ownersFiles = await repo.findOwnersFiles();
      expect(ownersFiles).toEqual(['OWNERS', 'foo/OWNERS']);
    });
  });
});
