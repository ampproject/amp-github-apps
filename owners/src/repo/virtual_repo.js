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
    await this.findOwnersFiles();
  }

  /**
   * Read the contents of a file from the repo.
   *
   * @param {string} relativePath file to read.
   * @return {string} file contents.
   */
  async readFile(relativePath) {
    const fileSha = this._fileRefs.get(relativePath);
    if (!fileSha) {
      throw new Error(
        `File "${relativePath}" not found in virtual repository; ` +
          'can only read files found through `findOwnersFiles`.'
      );
    }

    return await this.cache.readFile(relativePath, async () => {
      return await this.github.getFileContents({
        filename: relativePath,
        sha: fileSha,
      });
    });
  }

  /**
   * Finds all OWNERS files in the repository and records them as known files.
   *
   * @return {!Array<string>} a list of relative OWNERS file paths.
   */
  async findOwnersFiles() {
    const ownersFiles = await this.github.searchFilename('OWNERS');

    ownersFiles.forEach(({filename, sha}) => {
      const fileSha = this._fileRefs.get(filename);
      if (!fileSha) {
        // File has never been fetched and should be added to the cache.
        this.logger.info(`Recording SHA for file "${filename}"`);
        this._fileRefs.set(filename, sha);
      } else if (fileSha !== sha) {
        // File has been updated and needs to be re-fetched.
        this.logger.info(
          `Updating SHA and clearing cache for file "${filename}"`
        );
        this._fileRefs.set(filename, sha);
        this.cache.invalidate(filename);
      } else {
        this.logger.debug(`Ignoring unchanged file "${filename}"`);
      }
    });

    return ownersFiles.map(({filename}) => filename);
  }
};
