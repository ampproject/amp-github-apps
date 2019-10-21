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

const {CloudStorage} = require('./cloud_storage');

/**
 * A Cloud Storage-backed file cache.
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
      const contents = await getContents();
      // Do not `await`` the upload; this can happen async in the background.
      this.storage
        .upload(filename, contents)
        .catch(err => console.error(`Error uploading "${filename}": `, err));
      return contents;
    }
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

/**
 * An in-memory file cache.
 */
class MemoryCache {
  /**
   * Constructor.
   */
  constructor() {
    this.files = new Map();
  }

  /**
   * Fetch the contents of a file.
   *
   * @param {string} filename file to get contents of.
   * @param {string} getContents function to get contents if file not in cache.
   * @return {string} file contents.
   */
  async readFile(filename, getContents) {
    if (this.files.has(filename)) {
      return this.files.get(filename);
    }

    const contents = await getContents();
    this.files.set(filename, contents);
    return contents;
  }

  /**
   * Invalidate the cache for a file.
   *
   * @param {string} filename file to drop from the cache.
   */
  async invalidate(filename) {
    this.files.delete(filename);
  }
}

/**
 * A compound cache maintaining files in-memory and backed up by Cloud Storage.
 *
 * The memory cache allows the app to keep key owners files in memory for when
 * the ownership tree needs to be re-parsed (minimizing requests to Cloud
 * Storage APIs), while the Cloud Storage cache allows the app to bootstrap its
 * collection of OWNERS files on startup (preventing it from blasting the GitHub
 * API on startup).
 */
class CompoundCache {
  /**
   * Constructor.
   *
   * @param {string} bucketName Cloud Storage bucket name.
   */
  constructor(bucketName) {
    this.cloudStorageCache = new CloudStorageCache(bucketName);
    this.memoryCache = new MemoryCache();
  }

  /**
   * Fetch the contents of a file.
   *
   * @param {string} filename file to get contents of.
   * @param {string} getContents function to get contents if file not in cache.
   * @return {string} file contents.
   */
  async readFile(filename, getContents) {
    return await this.memoryCache.readFile(filename, async () => {
      return await this.cloudStorageCache.readFile(filename, getContents);
    });
  }

  /**
   * Invalidate the cache for a file.
   *
   * @param {string} filename file to drop from the cache.
   */
  async invalidate(filename) {
    await this.memoryCache.invalidate(filename);
    await this.cloudStorageCache.invalidate(filename);
  }
}

module.exports = {CloudStorageCache, CompoundCache, MemoryCache};
