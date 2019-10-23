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

const {CloudStorage} = require('../cloud_storage');
const FileCache = require('./file_cache');

/**
 * A Cloud Storage-backed file cache.
 */
module.exports = class CloudStorageCache extends FileCache {
  /**
   * Constructor.
   *
   * @param {string} bucketName Cloud Storage bucket name.
   * @param {Logger=} [logger=console] logging interface.
   */
  constructor(bucketName, logger) {
    super();
    this.logger = logger || console;
    this.storage = new CloudStorage(bucketName, this.logger);
  }

  /**
   * Fetch the contents of a file.
   *
   * @param {string} filename file to get contents of.
   * @param {string} getContents function to get contents if file not in cache.
   * @return {string} file contents.
   */
  async readFile(filename, getContents) {
    try {
      this.logger.info(`Fetching "${filename}" from Cloud Storage cache`);
      return await this.storage.download(filename);
    } catch (e) {
      this.logger.info(`Cache miss on "${filename}"`);
      const contents = await getContents();

      this.logger.info(`Uploading "${filename}" to Cloud Storage cache`);
      // Do not `await`` the upload; this can happen async in the background.
      this.storage
        .upload(filename, contents)
        .catch(err =>
          console.error(`Error uploading "${filename}": ${err.message}`)
        );

      return contents;
    }
  }

  /**
   * Invalidate the cache for a file.
   *
   * @param {string} filename file to drop from the cache.
   */
  async invalidate(filename) {
    this.logger.info(`Invalidating Cloud Storage cache of "${filename}"`);
    await this.storage.delete(filename);
  }
};
