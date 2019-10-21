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

const {Storage} = require('@google-cloud/storage');

/**
 * Google Cloud Storage interface for uploading and downloading files.
 */
class CloudStorage {
  /**
   * Constructor.
   *
   * @param {string} bucketName Cloud Storage bucket name.
   */
  constructor(bucketName) {
    this.storage = new Storage();
    this.bucketName = bucketName;
  }

  /**
   * Get a reference to a file in storage.
   *
   * @param {string} filename file to access.
   * @return {File} reference to a Cloud Storage file.
   */
  file(filename) {
    return this.storage.bucket(this.bucketName).file(filename);
  }

  /**
   * Write a file to storage.
   *
   * @param {string} filename file to write.
   * @param {string} contents file contents.
   */
  async upload(filename, contents) {
    await this.file(filename).save(contents, {resumable: false});
  }

  /**
   * Read a file from storage.
   *
   * @param {string} filename file to download.
   * @return {string} file contents.
   */
  async download(filename) {
    const [contents] = await this.file(filename).download();
    return contents.toString('utf8');
  }

  /**
   * Delete a file in storage.
   *
   * @param {string} filename file to delete.
   */
  async delete(filename) {
    await this.file(filename).delete();
  }
}

/**
 * A Cloud Storage-backed cache.
 */
class CloudStorageCache {
  /**
   * Constructor.
   *
   * @param {string} bucketName Cloud Storage bucket name.
   */
  constructor(bucketName) {
    this.storage = new CloudStorage(bucketName);
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
      return await this.storage.download(filename);
    } catch (e) {
      const contents = getContents();
      // Do not `await`` the upload; this can happen async in the background.
      this.storage.upload(filename, contents);
      return contents;
    };
  }

  /**
   * Invalidate the cache for a file.
   *
   * @param {string} filename file to drop from the cache.
   */
  async invalidate(filename) {
    await this.storage.delete(filename);
  }
}

module.exports = {CloudStorage, CloudStorageCache};
