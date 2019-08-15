/**
 * Copyright 2019 Google Inc.
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
const sinon = require('sinon');
const fs = require('fs').promises;


describe('local repository', () => {
  const sandbox = sinon.createSandbox();
  let repo;

  beforeEach(() => {
    repo = new LocalRepository('path/to/repo');
    sandbox.stub(repo, 'getAbsolutePath').callsFake((relativePath) => {
      return `path/to/repo/${relativePath}`;
    });
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
      sandbox.stub(repo, 'runCommands');
    });

    it('fetches and checks out the requested branch', async () => {
      await repo.checkout('my_branch');
      sandbox.assert.calledWith(
          repo.runCommands,
          'git fetch origin my_branch',
          'git checkout -B my_branch origin/my_branch',
      );
    });

    it('defaults to master', async () => {
      await repo.checkout();
      sandbox.assert.calledWith(
          repo.runCommands,
          'git fetch origin master',
          'git checkout -B master origin/master',
      );
    });
  });

  describe('getAbsolutePath', () => {
    it('prepends the repository root directory path', () => {
      expect(repo.getAbsolutePath('file/path.txt'))
          .toEqual('path/to/repo/file/path.txt');
    });
  });

  describe('readFile', () => {
    const FAKE_OWNERS_CONTENTS = 'user1\nuser2\nuser3\n';

    beforeEach(() => {
      sandbox.stub(fs, 'readFile').returns(FAKE_OWNERS_CONTENTS);
    });

    it('reads from the absolute file path', async () => {
      await repo.readFile('my/file.txt');
      sandbox.assert.calledWith(
          fs.readFile, 'path/to/repo/my/file.txt', {encoding: 'utf8'});
    });

    it('returns the contents of the file', async () => {
      const contents = await repo.readFile('');
      expect(contents).toEqual(FAKE_OWNERS_CONTENTS);
    });
  });

  describe('findOwnersFiles', () => {
    FAKE_OWNERS_LIST_OUTPUT = 'foo.txt\nbar/baz.txt\n';

    it('splits the owners list from the command line output', async () => {
      sandbox.stub(repo, 'runCommands').returns(FAKE_OWNERS_LIST_OUTPUT);
      const ownersFiles = await repo.findOwnersFiles();
      expect(ownersFiles).toEqual(['foo.txt', 'bar/baz.txt']);
    });
  });
});
