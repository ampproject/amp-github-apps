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

const path = require('path');
const yaml = require('yamljs');

/**
 * A tree of ownership keyed by directory.
 */
class OwnersTree {
  /**
   * Constructor.
   *
   * @param {!string=} dirPath relative the directory containing owners file.
   * @param {OwnersTree=} parent parent tree of the node (null for root)
   */
  constructor(dirPath, parent) {
    this.parent = parent || null;
    this.dirPath = dirPath || '.';

    this.isRoot = !parent;
    this.depth = this.isRoot ? 0 : this.parent.depth + 1;

    this.rules = [];
    this.children = {};
  }

  /**
   * Get a subdirectory tree.
   *
   * @param {!string} dirName subdirectory name.
   * @return {?OwnersTree} subdirectory tree, or null if non-existant.
   */
  get(dirName) {
    return this.children[dirName] || null;
  }

  /**
   * Add a rule to the tree.
   *
   * Adds to the current node if paths match; otherwise, adds it to the node
   * keyed by the next directory name.
   *
   * @param {!OwnersRule} rule rule to add.
   */
  addRule(rule) {
    if (rule.dirPath === this.dirPath) {
      this.rules.push(rule);
    } else {
      const nextDir = rule.dirPath.split(path.sep)[this.depth];

      if (!this.get(nextDir)) {
        this.children[nextDir] = new OwnersTree(
          path.join(this.dirPath, nextDir),
          this
        );
      }

      this.get(nextDir).addRule(rule);
    }
  }

  /**
   * Provides a list of ownership rules for the tree.
   *
   * Includes the node's own rule as well as inherited rules, in decreasing
   * order of depth (ie. the root OWNERS rules will be last).
   *
   * @return {OwnersRule[]} list of all ownership rules for the directory.
   */
  get allRules() {
    const parentRules = this.isRoot ? [] : this.parent.allRules;
    return this.rules.concat(parentRules);
  }

  /**
   * Provides the deepest ownership rule applicable to a file or directory.
   *
   * @param {!string} filePath relative path to file/directory.
   * @return {OwnersRule[]} list of rules for the file/directory.
   */
  atPath(filePath) {
    const segments = filePath.split(path.sep);
    let subtree = this;

    while (segments.length) {
      const nextDir = segments.shift();
      if (!subtree.get(nextDir)) {
        break;
      }
      subtree = subtree.get(nextDir);
    }

    return subtree;
  }

  /**
   * Tests if a user is in the ownership path of the tree.
   *
   * @param {!string} username user to check ownership of.
   * @return {boolean} true of the username is in this or an ancestor's OWNERS.
   */
  hasOwner(username) {
    return this.rules.some(rule => rule.owners.includes(username)) ||
          (!!this.parent && this.parent.hasOwner(username))
  }

  /**
   * Renders the ownership tree as a string.
   *
   * @return {string} visual representation of the tree.
   */
  toString() {
    const lines = [];

    const rulePrefix = '-';
    const childPrefix = '└---';
    const indent = Math.max(0, this.depth - 1) * childPrefix.length;
    const prefix = this.isRoot ? '' : `${' '.repeat(indent)}${childPrefix}`;
    const dirName = this.isRoot
      ? 'ROOT'
      : this.dirPath.split(path.sep).slice(-1);

    lines.push(`${prefix}${dirName}`);
    this.rules.forEach(rule => {
      lines.push(
        `${' '.repeat(indent)}${rulePrefix} ${rule.owners.join(', ')}`
      );
    });

    /* eslint-disable-next-line guard-for-in */
    for (const dirName in this.children) {
      lines.push(this.get(dirName).toString());
    }

    return lines.join('\n');
  }
}

/**
 * A rule describing ownership for a directory.
 */
class OwnersRule {
  /**
   * Constructor.
   *
   * @param {!string} ownersPath path to OWNERS file.
   * @param {string[]} owners list of GitHub usernames of owners.
   */
  constructor(ownersPath, owners) {
    this.dirPath = path.dirname(ownersPath);
    this.owners = owners;
  }

  /**
   * Test if a file is matched by the rule.
   *
   * Currently only tests directory hierarchy; may be modified to test
   * filetypes, globs, special cases like package.json, etc.
   *
   * @param {!string} filePath relative path in repo to the file being checked.
   * @return {boolean} true if the rule applies to the file.
   */
  matchesFile(filePath) {
    const filePathDir = path.dirname(filePath);
    const filePathSegments = filePathDir
      .split(path.sep)
      .filter(segment => segment != '.');
    const rulePathSegments = this.dirPath
      .split(path.sep)
      .filter(segment => segment != '.');

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
  parseOwnersFile(ownersPath) {
    const contents = this.localRepo.readFile(ownersPath);
    const ownersList = yaml.parse(contents);

    return new OwnersRule(ownersPath, ownersList);
  }

  /**
   * Parse all OWNERS rules in the repo.
   *
   * TODO: Replace this with `parseAllOwnersRulesForFiles` to reduce OWNERS file
   * reads
   *
   * @return {OwnersRule[]} a list of all rules defined in the local repo.
   */
  parseAllOwnersRules() {
    const ownersPaths = this.localRepo.findOwnersFiles();
    return ownersPaths.map(ownersPath => this.parseOwnersFile(ownersPath));
  }

  /**
   * Parse all OWNERS rules into a tree.
   *
   * @return {OwnersTree} owners rule hierarchy.
   */
  parseOwnersTree() {
    const tree = new OwnersTree(this.localRepo.rootPath);
    const rules = this.parseAllOwnersRules().forEach(
      rule => tree.addRule(rule));
    return tree;
  }
}

module.exports = {OwnersParser, OwnersRule, OwnersTree};
