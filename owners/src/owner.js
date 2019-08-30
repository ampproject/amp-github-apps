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
// TODO: Replace the RepoFile class and uses with LocalRepo.
const {RepoFile} = require('./repo-file');
const {LocalRepository} = require('./local_repo');
const {OwnersParser} = require('./owners');

/**
 * @file Contains classes and functions in relation to "OWNER" files
 * and theyre evaluation.
 */

/**
 * Represents an OWNER file found in the repo.
 */
class Owner {
  /**
   * @param {!Array} config
   * @param {string} pathToRepoDir
   * @param {string} filePath
   * @constructor
   */
  constructor(config, pathToRepoDir, filePath) {
    // We want it have the leading ./ to evaluate `.` later on
    this.path = /^\./.test(filePath) ? filePath : `.${path.sep}${filePath}`;
    this.dirname = path.dirname(this.path);
    this.fullpath = path.join(pathToRepoDir, this.path);
    this.score = (this.dirname.match(/\//g) || []).length;

    this.dirOwners = [];
    this.fileOwners = Object.create(null);
    this.parseConfig_(config);
  }

  /**
   * @param {!Array} config
   */
  parseConfig_(config) {
    config.forEach(entry => {
      if (typeof entry === 'string') {
        this.dirOwners.push(entry);
      }
    });
    this.dirOwners.sort();
  }

  /**
   * Parse all OWNERS files into Owner objects.
   *
   * @param {!LocalRepository} localRepo local repository to read from.
   * @param {!Logger} logger logging interface
   * @return {object} map of owners.
   */
  static async parseOwnersMap(localRepo, logger) {
    const parser = new OwnersParser(localRepo, logger);
    const ownersRules = await parser.parseAllOwnersRules();
    const ownersList = ownersRules.map(
      rule => new Owner(rule.owners, process.env.GITHUB_REPO_DIR, rule.filePath)
    );
    return createOwnersMap(ownersList);
  }

  /**
   * @param {!GitHub} github GitHub API interface.
   * @param {!number} prNumber pull request number
   * @return {object}
   */
  static async getOwners(github, prNumber) {
    // Update the local target repository of the latest from master
    const localRepo = new LocalRepository(process.env.GITHUB_REPO_DIR);
    await localRepo.checkout();

    const filenames = await github.listFiles(prNumber);
    const repoFiles = filenames.map(filename => new RepoFile(filename));
    const ownersMap = await this.parseOwnersMap(localRepo, github.logger);
    const owners = findOwners(repoFiles, ownersMap);

    return owners;
  }
}

/**
 * Returns a list of github usernames that can be "approvers" for the set
 * of files. It first tries to find the interection across the files and if
 * there are none it will return the union across usernames.
 * @param {!Array} files
 * @param {object} ownersMap
 * @return {object}
 */
function findOwners(files, ownersMap) {
  const fileOwners = Object.create(null);
  files.forEach(file => {
    const owner = findClosestOwnersFile(file, ownersMap);
    if (!fileOwners[owner.dirname]) {
      fileOwners[owner.dirname] = {
        owner,
        files: [file],
      };
    } else {
      fileOwners[owner.dirname].files.push(file);
    }
  });
  return fileOwners;
}

/**
 * Using the `ownersMap` key which is the path to the actual OWNER file
 * in the repo, we simulate a folder traversal by splitting the path and
 * finding the closest OWNER file for a RepoFile.
 *
 * @param {!RepoFile} file
 * @param {object} ownersMap
 * @return {object}
 */
function findClosestOwnersFile(file, ownersMap) {
  let dirname = file.dirname;
  let owner = ownersMap[dirname];
  const dirs = dirname.split(path.sep);

  while (!owner && dirs.pop() && dirs.length) {
    dirname = dirs.join(path.sep);
    owner = ownersMap[dirname];
  }
  return owner;
}

/**
 * @param {!Array} owners
 * @return {object}
 */
function createOwnersMap(owners) {
  return owners.reduce((ownersMap, owner) => {
    // Handles empty OWNERS.yaml files.
    if (!owner) {
      return ownersMap;
    }
    if (owner.dirOwners.length) {
      ownersMap[owner.dirname] = owner;
    }
    return ownersMap;
  }, Object.create(null));
}

module.exports = {
  Owner,
  findOwners,
  findClosestOwnersFile,
  createOwnersMap,
};
