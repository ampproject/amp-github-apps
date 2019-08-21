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


    this.rules = [];
    this.children = {};
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
    if (this.depth > 5) {
      return
    }
    if (rule.dirPath === this.dirPath) {
      this.rules.push(rule);
    } else {
      const nextDir = rule.dirPath.split(path.sep)[this.depth];

      if (!this.children[nextDir]) {
        this.children[nextDir] =
            new OwnersTree(path.join(this.dirPath, nextDir), this);
      }

      this.children[nextDir].addRule(rule)
    }
  }

  /**
   * Determines the directory tree depth of the OWNERS file.
   *
   * Used to determine precedence. The root OWNERS file has a depth of 0.
   *
   * @return {number} tree depth of the OWNERS file.
   */
  get depth() {
    return this.isRoot ? 0 : this.dirPath.split(path.sep).length;
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
   * Provides a list of ownership rules applicable to a file.
   *
   * The most specific rules will be first, while the root-level owners rules
   * will be last.
   *
   * @return {OwnersRule[]} list of rules for the file.
   */
  rulesForFile(filePath) {
    let segments = filePath.split(path.sep);
    let subtree = this;
    
    while (segments.length) {
      const nextDir = segments.shift();
      if (!subtree.children[nextDir]) {
        break;
      }
      subtree = subtree.children[nextDir];
    }

    return subtree.allRules;
  }

  /**
   * Renders the ownership tree as a string.
   *
   * @return {string} visual representation of the tree.
   */
  toString() {
    let lines = []

        const rulePrefix = '-';
    const childPrefix = '└---';
    const indent = Math.max(0, (this.depth - 1)) * childPrefix.length;
    const prefix = this.isRoot ? '' : `${' '.repeat(indent)}${childPrefix}`;
    const dirName =
        this.isRoot ? 'ROOT' : this.dirPath.split(path.sep).slice(-1);

    lines.push(`${prefix}${dirName}`);
    this.rules.forEach(
        rule => {lines.push(
            `${' '.repeat(indent)}${rulePrefix} ${rule.owners.join(', ')}`)});

    for (let dirName in this.children) {
      lines.push(this.children[dirName].toString());
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
   * @param {!string[]} owners list of GitHub usernames of owners.
   */
  constructor(ownersPath, owners) {
    this.dirPath = path.dirname(ownersPath);
    this.owners = owners;
  }

  /**
   * Gets the full (relative) OWNERS.yaml file path.
   *
   * @return {string} relative file path.
   */
  get filePath() {
    return path.join(`${this.dirPath}`, 'OWNERS.yaml');
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
}


module.exports = {
  OwnersParser,
  OwnersRule,
  OwnersTree,
};
