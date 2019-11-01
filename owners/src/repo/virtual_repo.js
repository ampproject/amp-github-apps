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

const Repository = require('./repo');

/**
 * Virtual in-memory repository holding owners files.
 */
module.exports = class VirtualRepository extends Repository {
  /**
   * Constructor.
   *
   * @param {!GitHub} github GitHub API interface.
   * @param {!FileCache} cache file cache.
   */
  constructor(github, cache) {
    super();
    this.github = github;
    this.logger = github.logger;
    /** @type {!Map<string, string>} */
    this._fileRefs = new Map();
    this.cache = cache;
  }

  /**
   * Fetch the latest versions of all OWNERS files.
   */
  async sync() {
    let fileChanged = false;
    const ownersFiles = await this.github.searchFilename('OWNERS');

    for (const {filename, sha} of ownersFiles) {
      const repoPath = this.repoPath(filename);
      const fileSha = this._fileRefs.get(repoPath);

      if (!fileSha) {
        // File has never been fetched and should be added to the cache.
        this.logger.info(`Recording SHA for file "${repoPath}"`);
        fileChanged = true;

        this._fileRefs.set(repoPath, sha);
      } else if (fileSha !== sha) {
        // File has been updated and needs to be re-fetched.
        this.logger.info(
          `Updating SHA and clearing cache for file "${repoPath}"`
        );
        fileChanged = true;

        this._fileRefs.set(repoPath, sha);
        await this.cache.invalidate(repoPath);
      } else {
        this.logger.debug(`Ignoring unchanged file "${repoPath}"`);
      }
    }

    if (fileChanged) {
      const fileRefsPath = this.repoPath('__fileRefs__');
      await this.cache.invalidate(fileRefsPath);
      await this.cache.readFile(fileRefsPath, () =>
        JSON.stringify(Array.from(this._fileRefs))
      );
    }
  }

  /**
   * Prefix a file path with the repo to prevent cross-repo name collisions.
   *
   * @param {string} filename relative file path.
   * @return {string} repository file path.
   */
  repoPath(filename) {
    return `${this.github.repository}/${filename}`;
  }

  /**
   * Warms up the cache with all owners files.
   *
   * @param {?function} cacheMissCallback called when there is a cache miss.
   */
  async warmCache(cacheMissCallback) {
    const fileRefsContents = await this.cache.readFile(
      this.repoPath('__fileRefs__'),
      async () => {
        const ownersFiles = await this.github.searchFilename('OWNERS');
        return JSON.stringify(
          ownersFiles.map(({filename, sha}) => [this.repoPath(filename), sha])
        );
      }
    );
    this._fileRefs = new Map(JSON.parse(fileRefsContents));

    const ownersFiles = await this.findOwnersFiles();
    await Promise.all(
      ownersFiles.map(filename => this.readFile(filename, cacheMissCallback))
    );
  }

  /**
   * Read the contents of a file from the repo.
   *
   * @param {string} relativePath file to read.
   * @param {?function} cacheMissCallback called when there is a cache miss.
   * @return {string} file contents.
   */
  async readFile(relativePath, cacheMissCallback) {
    const repoPath = this.repoPath(relativePath);
    const fileSha = this._fileRefs.get(repoPath);
    if (!fileSha) {
      throw new Error(
        `File "${repoPath}" not found in virtual repository; ` +
          'can only read files found through `findOwnersFiles`.'
      );
    }

    return await this.cache.readFile(repoPath, async () => {
      const contents = await this.github.getFileContents({
        filename: relativePath,
        sha: fileSha,
      });

      if (cacheMissCallback) {
        await cacheMissCallback();
      }

      return contents;
    });
  }

  /**
   * Finds all OWNERS files in the repository and records them as known files.
   *
   * @return {!Array<string>} a list of relative OWNERS file paths.
   */
  async findOwnersFiles() {
    const repoPrefix = this.repoPath('');
    return Array.from(this._fileRefs.keys())
      .filter(filename => filename.startsWith(repoPrefix))
      .map(filename => filename.substr(repoPrefix.length));
  }
};
