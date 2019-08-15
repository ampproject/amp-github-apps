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

const path = require('path');
const yaml = require('yamljs');


/**
 * A rule describing ownership for a directory.
 */
class OwnersRule {
  /**
   * Constructor.
   *
   * @param {!string} ownersPath path to OWNERS file.
   * @param {!string[]} owners list of GitHub usernames of owners.
   */
  constructor(ownersPath, owners) {
    this.dirPath = path.dirname(ownersPath);
    this.owners = owners;
  }

  /**
   * Determines the directory tree depth of the OWNERS file.
   *
   * Used to determine precedence. The root OWNERS file has a depth of 0.
   *
   * @return {number} tree depth of the OWNERS file.
   */
  get depth() {
    return this.dirPath === '.' ? 0 : this.dirPath.split(path.sep).length;
  }

  /**
   * Test if a file is matched by the rule.
   *
   * @param {!string} filePath relative path in repo to the file being checked.
   * @return {boolean} true if the rule applies to the file.
   */
  matchesFile(filePath) {
    const filePathDir = path.dirname(filePath)
    const filePathSegments =
        filePathDir.split(path.sep).filter(segment => segment != '.');
    const rulePathSegments =
        this.dirPath.split(path.sep).filter(segment => segment != '.');

    if (filePathSegments.length < rulePathSegments.length) {
      return false;
    }

    for (let i = 0; i < rulePathSegments.length; ++i) {
      if (rulePathSegments[i] !== filePathSegments[i]) {
        return false;
      }
    }

    return true;
  }
}


/**
 * Parser for OWNERS.yaml files.
 */
class OwnersParser {
  /**
   * Constructor.
   *
   * @param {!LocalRepository} localRepo local repository to read from.
   */
  constructor(localRepo) {
    this.localRepo = localRepo;
  }

  /**
   * Parse an OWNERS.yaml file.
   *
   * @param {!string} ownersPath OWNERS.yaml file path.
   * @return {OwnersRule} parsed OWNERS file rule.
   */
  async parseOwnersFile(ownersPath) {
    const contents = await this.localRepo.readFile(ownersPath);
    const ownersList = yaml.parse(contents);

    return new OwnersRule(ownersPath, ownersList);
  }

  /**
   * Parse all OWNERS rules in the repo.
   *
   * @return {OwnersRule[]} a list of all rules defined in the local repo.
   */
  async parseAllOwners() {
    const ownersPaths = await this.localRepo.findOwnersFiles();
    return await Promise.all(ownersPaths.map(
        ownersPath => this.parseOwnersFile(ownersPath)));
  }
}


module.exports = {
  OwnersParser,
  OwnersRule
};
