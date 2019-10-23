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

const AbstractFileCache = require('./abstract_file_cache');

/**
 * An in-memory file cache.
 */
module.exports = class MemoryCache extends AbstractFileCache {
  /**
   * Constructor.
   *
   * @param {Logger=} [logger=console] logging interface.
   */
  constructor(logger) {
    super();
    this.files = new Map();
    this.logger = logger || console;
  }

  /**
   * Fetch the contents of a file.
   *
   * @param {string} filename file to get contents of.
   * @param {string} getContents function to get contents if file not in cache.
   * @return {string} file contents.
   */
  async readFile(filename, getContents) {
    this.logger.debug(`Fetching "${filename}" from in-memory cache`);
    if (this.files.has(filename)) {
      return this.files.get(filename);
    }

    this.logger.debug(`Cache miss on "${filename}"`);
    const contents = await getContents();

    this.logger.debug(`Storing "${filename}" to in-memory cache`);
    this.files.set(filename, contents);

    return contents;
  }

  /**
   * Invalidate the cache for a file.
   *
   * @param {string} filename file to drop from the cache.
   */
  async invalidate(filename) {
    this.logger.debug(`Invalidating in-memory cache of "${filename}"`);
    this.files.delete(filename);
  }
};
