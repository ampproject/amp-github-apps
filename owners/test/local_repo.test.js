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

const {LocalRepository} = require('../src/local_repo');
const childProcess = require('child_process');
const sinon = require('sinon');
const fs = require('fs');
const path = require('path');

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

  describe('checkout', () => {
    beforeEach(() => {
      sandbox.stub(repo, 'runCommands').returns('');
    });

    it('fetches and checks out the requested branch', async () => {
      await repo.checkout('my_branch');
      sandbox.assert.calledWith(
        repo.runCommands,
        'git fetch origin my_branch',
        'git checkout -B my_branch origin/my_branch'
      );
    });

    it('defaults to master', async () => {
      await repo.checkout();
      sandbox.assert.calledWith(
        repo.runCommands,
        'git fetch origin master',
        'git checkout -B master origin/master'
      );
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
     * @param {!string} stdout content to output as stdout.
     * @param {!string} stderr content to output as stderr.
     */
    function stubExecAndSetRepo(error, stdout, stderr) {
      sandbox.stub(childProcess, 'exec').callsFake((commands, callback) => {
        return callback(error ? {stdout, stderr} : null, {stdout, stderr});
      });

      const {LocalRepository} = require('../src/local_repo');
      repo = new LocalRepository('path/to/repo');
    }

    it('executes the provided commands in the repo directory', async () => {
      stubExecAndSetRepo(false, '', '');
      await repo.runCommands('git status');
      sandbox.assert.calledWith(
        childProcess.exec,
        `cd path/to/repo && git status`
      );
    });

    it('returns the contents of stdout', async () => {
      stubExecAndSetRepo(false, 'Hello world!', 'Some extra output');
      await expect(repo.runCommands('echo "Hello world!"')).resolves.toEqual(
        'Hello world!'
      );
    });

    it('throws the contents of stderr if there is an error', async () => {
      stubExecAndSetRepo(true, '', 'ERROR!');
      await expect(repo.runCommands('failing command')).rejects.toEqual(
        'ERROR!'
      );
    });
  });

  describe('getAbsolutePath', () => {
    it('prepends the repository root directory path', () => {
      expect(repo.getAbsolutePath('file/path.txt')).toEqual(
        'path/to/repo/file/path.txt'
      );
    });
  });

  describe('readFile', () => {
    const FAKE_OWNERS_CONTENTS = 'user1\nuser2\nuser3\n';

    beforeEach(() => {
      sandbox.stub(fs, 'readFileSync').returns(FAKE_OWNERS_CONTENTS);
    });

    it('reads from the absolute file path', () => {
      repo.readFile('my/file.txt');
      sandbox.assert.calledWith(fs.readFileSync, 'path/to/repo/my/file.txt', {
        encoding: 'utf8',
      });
    });

    it('returns the contents of the file', () => {
      const contents = repo.readFile('');
      expect(contents).toEqual(FAKE_OWNERS_CONTENTS);
    });
  });

  describe('findOwnersFiles', () => {
    const FAKE_OWNERS_LIST_OUTPUT = 'foo.txt\nbar/baz.txt\n';

    it('splits the owners list from the command line output', async () => {
      sandbox.stub(repo, 'runCommands').returns(FAKE_OWNERS_LIST_OUTPUT);
      const ownersFiles = await repo.findOwnersFiles();
      expect(ownersFiles).toEqual(['foo.txt', 'bar/baz.txt']);
    });
  });
});
