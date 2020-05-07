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

/**
 * Generic file cache interface.
 * @interface
 */
module.exports = class FileCache {
  /**
   * Constructor.
   */
  constructor() {
    if (this.constructor === FileCache) {
      throw new TypeError('Cannot instantiate base class');
    }
  }

  /**
   * Fetch the contents of a file.
   *
   * @param {string} filename file to get contents of.
   * @param {string} getContents function to get contents if file not in cache.
   * @return {string} file contents.
   */
  async readFile(unusedFilename, unusedGetContents) {}

  /**
   * Invalidate the cache for a file.
   *
   * @param {string} filename file to drop from the cache.
   */
  async invalidate(unusedFilename) {}
};
