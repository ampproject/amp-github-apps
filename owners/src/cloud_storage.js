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
   * @param {Logger=} [logger=console] logging interface.
   */
  constructor(bucketName, logger) {
    this.storage = new Storage();
    this.bucketName = bucketName;
    this.logger = logger || console;
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
    this.logger.info(`Uploading "${filename}" to Cloud Storage`);
    await this.file(filename).save(contents, {resumable: false});
  }

  /**
   * Read a file from storage.
   *
   * @param {string} filename file to download.
   * @return {string} file contents.
   */
  async download(filename) {
    this.logger.info(`Downloading "${filename}" from Cloud Storage`);
    const [contents] = await this.file(filename).download();
    return contents.toString('utf8');
  }

  /**
   * Delete a file in storage.
   *
   * @param {string} filename file to delete.
   */
  async delete(filename) {
    this.logger.info(`Deleting "${filename}" from Cloud Storage`);
    await this.file(filename).delete();
  }
}

module.exports = {CloudStorage};
