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

const {GitHub} = require('../src/github');
const {Repository, LocalRepository, VirtualRepository} = require('../src/repo');
const {CompoundCache} = require('../src/file_cache');
const {CloudStorage} = require('../src/cloud_storage');
const childProcess = require('child_process');
const sinon = require('sinon');
const fs = require('fs');
const path = require('path');

describe('repository', () => {
  const repo = new Repository();

  describe('readFile', () => {
    it('throws an error', () => {
      expect(repo.readFile('foo/file.txt')).rejects.toEqual(
        new Error('Not implemented')
      );
    });
  });

  describe('findOwnersFiles', () => {
    it('throws an error', () => {
      expect(repo.findOwnersFiles()).rejects.toEqual(
        new Error('Not implemented')
      );
    });
  });
});

describe('virtual repository', () => {
  const sandbox = sinon.createSandbox();
  const github = new GitHub({}, 'ampproject', 'amphtml', sinon.stub(console));
  let repo;

  beforeEach(() => {
    const cache = new CompoundCache('my-bucket-name');
    repo = new VirtualRepository(github, cache);

    sandbox
      .stub(CloudStorage.prototype, 'download')
      .rejects(new Error('Not found'));
    sandbox.stub(CloudStorage.prototype, 'upload').resolves();
    sandbox.stub(CloudStorage.prototype, 'delete');

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

describe('local repository', () => {
  const sandbox = sinon.createSandbox();
  let repo;

  beforeEach(() => {
    repo = new LocalRepository('path/to/repo');
    sandbox.stub(path, 'resolve').callsFake((...paths) => paths.join(path.sep));
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe('constructor', () => {
    it('initializes the root directory and remote', () => {
      repo = new LocalRepository('path/to/repo', 'my_remote');
      expect(repo.rootDir).toEqual('path/to/repo');
      expect(repo.remote).toEqual('my_remote');
    });

    it('defaults to "origin" remote', () => {
      expect(repo.remote).toEqual('origin');
    });
  });

  describe('sync', () => {
    it('checks out the local repository', async done => {
      sandbox.stub(LocalRepository.prototype, 'checkout');
      await repo.sync();

      sandbox.assert.calledOnce(repo.checkout);
      done();
    });
  });

  describe('checkout', () => {
    beforeEach(() => {
      sandbox.stub(repo, '_runCommands').returns('');
    });

    it('fetches and checks out the requested branch', async done => {
      await repo.checkout('my_branch');

      sandbox.assert.calledWith(
        repo._runCommands,
        'git fetch origin my_branch',
        'git checkout -B my_branch origin/my_branch'
      );
      done();
    });

    it('defaults to master', async done => {
      await repo.checkout();

      sandbox.assert.calledWith(
        repo._runCommands,
        'git fetch origin master',
        'git checkout -B master origin/master'
      );
      done();
    });
  });

  describe('runCommands', () => {
    beforeEach(() => {
      jest.resetModules();
    });

    /**
     * Stubs `child_process.exec`` and initializes the local repo instance.
     *
     * Since the module imports and wraps `exec`, it must be stubbed before
     * requiring the module.
     *
     * @param {number} error error code from executing the command.
     * @param {string} stdout content to output as stdout.
     * @param {string} stderr content to output as stderr.
     */
    function stubExecAndSetRepo(error, stdout, stderr) {
      sandbox.stub(childProcess, 'exec').callsFake((commands, callback) => {
        return callback(error ? {stdout, stderr} : null, {stdout, stderr});
      });

      const {LocalRepository} = require('../src/repo');
      repo = new LocalRepository('path/to/repo');
    }

    it('executes the provided commands in the repo directory', async done => {
      stubExecAndSetRepo(false, '', '');
      await repo._runCommands('git status');

      sandbox.assert.calledWith(
        childProcess.exec,
        `cd path/to/repo && git status`
      );
      done();
    });

    it('returns the contents of stdout', async () => {
      expect.assertions(1);
      stubExecAndSetRepo(false, 'Hello world!', 'Some extra output');
      await expect(repo._runCommands('echo "Hello world!"')).resolves.toEqual(
        'Hello world!'
      );
    });

    it('throws the contents of stderr if there is an error', async () => {
      expect.assertions(1);
      stubExecAndSetRepo(true, '', 'ERROR!');
      await expect(repo._runCommands('failing command')).rejects.toEqual(
        'ERROR!'
      );
    });
  });

  describe('getAbsolutePath', () => {
    it('prepends the repository root directory path', () => {
      expect(repo._getAbsolutePath('file/path.txt')).toEqual(
        'path/to/repo/file/path.txt'
      );
    });
  });

  describe('readFile', () => {
    const FAKE_OWNERS_CONTENTS = 'user1\nuser2\nuser3\n';

    beforeEach(() => {
      sandbox.stub(fs, 'readFileSync').returns(FAKE_OWNERS_CONTENTS);
    });

    it('reads from the absolute file path', async done => {
      await repo.readFile('my/file.txt');

      sandbox.assert.calledWith(fs.readFileSync, 'path/to/repo/my/file.txt', {
        encoding: 'utf8',
      });
      done();
    });

    it('returns the contents of the file', async () => {
      expect.assertions(1);
      const contents = await repo.readFile('');
      expect(contents).toEqual(FAKE_OWNERS_CONTENTS);
    });
  });

  describe('findOwnersFiles', () => {
    const FAKE_OWNERS_LIST_OUTPUT = 'foo.txt\nbar/baz.txt\n';

    it('splits the owners list from the command line output', async () => {
      expect.assertions(1);
      sandbox.stub(repo, '_runCommands').returns(FAKE_OWNERS_LIST_OUTPUT);
      const ownersFiles = await repo.findOwnersFiles();
      expect(ownersFiles).toEqual(['foo.txt', 'bar/baz.txt']);
    });
  });
});
