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
const {OwnersParser} = require('./owners');
const yaml = require('yamljs');


/**
 * Git Interface.
 */
class Git {
  /**
   * @param {!object} context Probot request context (for logging).
   */
  constructor(context) {
    this.context = context;
  }

  /**
   * Retrieves all the OWNERS rules inside the local repository.
   *
   * @param {!LocalRepository} localRepo local repository to read from.
   * @return {Map<string, Owner>} a map from directories to their owners.
   */
  async getOwnersFilesForBranch(localRepo) {
    const parser = new OwnersParser(localRepo);
    const ownersRules = await parser.parseAllOwnersRules();
    const ownersList = ownersRules.map(
        rule => Owner(rule.owners, localRepo.rootDir, rule.filePath))

    return createOwnersMap(ownersList);
  }

  /**
   * Checks out the repository.
   *
   * @param {!LocalRepository} localRepo local repository to checkout.
   */
  pullLatestForRepo(localRepo) {
    localRepo.checkout();
  }
}

module.exports = {Git};
