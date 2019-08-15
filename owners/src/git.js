/**
 * Copyright 2016 Google Inc.
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

const {Owner, createOwnersMap} = require('./owner');
const yaml = require('yamljs');
const path = require('path');
const util = require('util');
const child_process = require('child_process');
const exec = util.promisify(child_process.exec);
const fs = require('fs').promises;

const BRANCH_UP_TO_DATE_REGEX = /your branch is up-?to-?date/i;

/**
 * @param {string} str
 * @return {object}
 */
function yamlReader(str) {
  return yaml.parse(str);
}

/**
 * Git Interface.
 */
class Git {
  /**
   * @param {object} context
   */
  constructor(context) {
    this.context = context;
  }

  /**
   * Reads the actual OWNER file on the file system and parses it using the
   * passed in `formatReader` and returns an `OwnersMap`.
   *
   * @param {!function(string):object} formatReader config file format parser.
   * @param {!LocalRepository} localRepo local repository to read from.
   * @param {!string[]} ownersPaths list of relative paths to OWNERS files
   * @return {object} map of directory paths to their owners
   */
  async ownersParser(formatReader, localRepo, ownersPaths) {
    const ownersList = await ownersPaths.map(async (ownerPath) => {
      const fileContents = await localRepo.readFile(ownerPath);
      const config = formatReader(fileContents);

      if (!config) {
        const str = `No config found for ${fullPath}`;
        this.context.log.error(str);
        // This handles OWNERS.yaml files that are empty.
        return null;
      }

      return new Owner(config, localRepo.rootDir, ownerPath);
    });

    return createOwnersMap(ownersList);
  }

  /**
   * Retrieves all the OWNERS paths inside a repository.
   * @param {!LocalRepository} localRepo local repository to read from.
   * @return {!Promise<!OwnersMap>}
   */
  async getOwnersFilesForBranch(localRepo) {
    const ownersPaths = await localRepo.findOwnersFiles();
    return this.ownersParser(yamlReader, localRepo.rootDir, ownersPaths);
  }

  /**
   * cd's into an assumed git directory on the file system and does a hard
   * reset to the remote branch.
   * @param {!LocalRepository} localRepo local repository to checkout into.
   */
  pullLatestForRepo(localRepo) {
    localRepo.checkout();
  }
}

module.exports = {Git};
