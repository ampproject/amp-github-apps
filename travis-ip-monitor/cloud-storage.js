/**
 * Copyright 2019, the AMP HTML authors
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
'use strict';


class CloudStorage {
  constructor(bucket) {
    this.bucket = bucket;
  }

  /**
   * Upload data to the Cloud Storage bucket.
   *
   * @param name file name to upload to.
   * @param contents data to upload, as a string.
   */
  async upload(name, contents) {
    console.log(`Uploading ${contents.length} bytes to file "${name}":`);
    await this.bucket.file(name).save(contents, {resumable: false});
  }

  /**
   * Download an object from the Cloud Storage bucket.
   *
   * @param name file name to download.
   * @returns the contents of the specified file.
   */
  async download(name) {
    console.log(`Downloading file "${name}"`);
    const chunks = [];
    const ipListFile = this.bucket.file(name)

    return await new Promise((resolve, reject) => {
      ipListFile.createReadStream()
        .on('error', (err) => {
          console.error(err);
        })
        .on('data', (chunk) => {
          chunks.push(chunk);
        })
        .on('end', () => {
          resolve(Buffer.concat(chunks).toString());
        });
    });
  }
}

module.exports = {CloudStorage}