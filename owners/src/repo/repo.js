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
 * Interface for reading from a GitHub repository.
 * @Interface
 */
module.exports = class Repository {
  /**
   * Constructor.
   */
  constructor() {
    if (this.constructor === Repository) {
      throw new TypeError('Cannot instantiate base class');
    }
  }

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
  async readFile(relativePath) {}

  /**
   * Finds all OWNERS files in the checked out repository.
   *
   * Assumes repo is already checked out.
   *
   * @return {!Array<string>} a list of relative OWNERS file paths.
   */
  async findOwnersFiles() {}
};
