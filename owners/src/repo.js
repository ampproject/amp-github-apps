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

const path = require('path');
const fs = require('fs');
const childProcess = require('child_process');
const util = require('util');
const exec = util.promisify(childProcess.exec);

/**
 * Execute raw shell commands.
 *
 * @private
 * @param {...string} commands list of commands to execute.
 * @return {!Array<string>} command output
 */
async function runCommands(...commands) {
  return exec(commands.join(' && '))
    .then(({stdout, stderr}) => stdout)
    .catch(({stdout, stderr}) => {
      throw stderr;
    });
}

/**
 * Interface for reading from a GitHub repository.
 */
class Repository {
  /**
   * Perform any required syncing with the repository.
   */
  async sync() {}

  /**
   * Read the contents of a file from the repo.
   *
   * @param {string} relativePath file to read.
   * @return {string} file contents.
   */
  async readFile(relativePath) {
    throw new Error('Not implemented');
  }

  /**
   * Finds all OWNERS files in the checked out repository.
   *
   * Assumes repo is already checked out.
   *
   * @return {!Array<string>} a list of relative OWNERS file paths.
   */
  async findOwnersFiles() {
    throw new Error('Not implemented');
  }
}

/**
 * Virtual in-memory repository holding owners files.
 */
class VirtualRepository extends Repository {
  /**
   * Constructor.
   *
   * @param {!GitHub} github GitHub API interface.
   */
  constructor(github) {
    super();
    this.github = github;
    this.logger = github.logger;
    /** @type {!Map<string, !VirtualFile>} */
    this._knownFiles = new Map();
  }

  /**
   * Fetch the latest versions of all OWNERS files.
   */
  async sync() {
    await this.findOwnersFiles();
  }

  /**
   * Read the contents of a file from the repo.
   *
   * @param {string} relativePath file to read.
   * @return {string} file contents.
   */
  async readFile(relativePath) {
    const file = this._knownFiles.get(relativePath);
    if (!file) {
      throw new Error(
        `File "${relativePath}" not found in virtual repository; ` +
          'can only read files found through `findOwnersFiles`.'
      );
    }

    if (file.contents === null) {
      file.contents = await this.github.getFileContents({
        filename: relativePath,
        sha: file.sha,
      });
    }

    return file.contents;
  }

  /**
   * Finds all OWNERS files in the repository and records them as known files.
   *
   * @return {!Array<string>} a list of relative OWNERS file paths.
   */
  async findOwnersFiles() {
    const ownersFiles = await this.github.searchFilename('OWNERS');

    ownersFiles.forEach(({filename, sha}) => {
      const file = this._knownFiles.get(filename);
      if (!file) {
        // File has never been fetched and should be added to the cache.
        this.logger.info(`Recording SHA for file "${filename}"`);
        this._knownFiles.set(filename, {sha, contents: null});
      } else if (file.sha !== sha) {
        // File has been updated and needs to be re-fetched.
        this.logger.info(
          `Updating SHA and clearing cache for file "${filename}"`
        );
        file.sha = sha;
        file.contents = null;
      }
    });

    return ownersFiles.map(({filename}) => filename);
  }
}

/**
 * Interface for reading from a checked out repository using relative paths.
 */
class LocalRepository extends Repository {
  /**
   * Constructor.
   *
   * @param {string} pathToRepoDir absolute path to the repository root
   *     directory.
   * @param {?string=} remote git remote to clone (default: 'origin').
   */
  constructor(pathToRepoDir, remote) {
    super();
    this.rootDir = pathToRepoDir;
    this.remote = remote || 'origin';
  }

  /**
   * Checks out the master branch.
   */
  async sync() {
    await this.checkout();
  }

  /**
   * Runs commands in the repository's root directory.
   *
   * @param {...string} commands list of commands to execute.
   * @return {!Array<string>} command output
   */
  async _runCommands(...commands) {
    return await runCommands(`cd ${this.rootDir}`, ...commands);
  }

  /**
   * Check out a branch locally.
   *
   * @param {?string=} [branch=master] git branch to checkout.
   */
  async checkout(branch) {
    branch = branch || 'master';
    await this._runCommands(
      `git fetch ${this.remote} ${branch}`,
      `git checkout -B ${branch} ${this.remote}/${branch}`
    );
  }

  /**
   * Get an absolute path for a relative repo path.
   *
   * @param {string} relativePath file or directory path relative to the root.
   * @return {string} absolute path to the file in the checked out repo.
   */
  _getAbsolutePath(relativePath) {
    return path.resolve(this.rootDir, relativePath);
  }

  /**
   * Read the contents of a file from the checked out repo.
   *
   * @param {string} relativePath file to read.
   * @return {string} file contents.
   */
  async readFile(relativePath) {
    const filePath = this._getAbsolutePath(relativePath);
    return fs.readFileSync(filePath, {encoding: 'utf8'});
  }

  /**
   * Finds all OWNERS files in the checked out repository.
   *
   * Assumes repo is already checked out.
   *
   * @return {!Array<string>} a list of relative OWNERS file paths.
   */
  async findOwnersFiles() {
    // NOTE: for some reason `git ls-tree --full-tree -r HEAD **/OWNERS*`
    // doesn't work from here.
    const ownersFiles = await this._runCommands(
      [
        // Lists all files in the repo with extra metadata.
        'git ls-tree --full-tree -r HEAD',
        // Cuts out the first three columns.
        'cut -f2',
        // Finds OWNERS files.
        'egrep "OWNERS$"',
      ].join('|')
    );

    return ownersFiles.trim().split('\n');
  }
}

module.exports = {Repository, LocalRepository, VirtualRepository};
