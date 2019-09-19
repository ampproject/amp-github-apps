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
   * @return {OwnersTree} the tree node the rule was added to.
   */
  addRule(rule) {
    if (rule.dirPath === this.dirPath) {
      this.rules.push(rule);
      return this;
    }

    const nextDir = rule.dirPath.split(path.sep)[this.depth];

    if (!this.get(nextDir)) {
      this.children[nextDir] = new OwnersTree(
        path.join(this.dirPath, nextDir),
        this
      );
    }

    return this.get(nextDir).addRule(rule);
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
   * Provides a list of ownership rules for a file.
   *
   * Includes the node's own rules as well as inherited rules, in decreasing
   * order of depth (ie. the root OWNERS rules will be last).
   *
   * @param {!string} filename filename to get rules for.
   * @return {OwnersRule[]} list of all ownership rules for the file.
   */
  fileRules(filename) {
    return this.allRules.filter(rule => rule.matchesFile(filename));
  }

  /**
   * Provides a list of owners rules for a file.
   *
   * @return {Owner[]} list of all owners for the file.
   */
  fileOwners(filename) {
    return this.fileRules(filename)
        .map(rule => rule.owners)
        .reduce((left, right) => left.concat(right), []);
  }

  /**
   * Provides the deepest ownership tree with rules applicable to a file or
   * directory.
   *
   * @param {!string} filePath relative path to file/directory.
   * @return {OwnersRule[]} list of rules for the file/directory.
   */
  atPath(filePath) {
    const segments = filePath.split(path.sep);
    let subtree = this;

    if (!this.isRoot) {
      const treeSegments = this.dirPath.split(path.sep);
      while (treeSegments.length) {
        const nextTreeDir = treeSegments.shift();
        const nextDir = segments.shift();
        if (nextTreeDir !== nextDir) {
          throw new Error(
            `Tried to find subtree at path "${filePath}" on a subtree at path "${this.dirPath}"`
          );
        }
      }
    }

    while (segments.length) {
      const nextDir = segments.shift();
      if (!subtree.get(nextDir)) {
        break;
      }
      subtree = subtree.get(nextDir);
    }

    while (!subtree.rules.length && !subtree.isRoot) {
      subtree = subtree.parent;
    }

    return subtree;
  }

  /**
   * Lists of owners which have modifiers from this tree to the root.
   *
   * @param {!OWNER_MODIFIER} modifier owner modifier.
   * @return {Owner[]} list of owners.
   */
  getModifiedOwners(modifier) {
    const modifiedOwners = {};

    this.allRules.forEach(rule => {
      rule.owners
        .filter(owner => owner.modifier === modifier)
        .forEach(owner => {
          if (!modifiedOwners[owner.name]) {
            modifiedOwners[owner.name] = owner;
          }
        });
    });

    return Object.values(modifiedOwners);
  }

  /**
   * Tests if a user is in the ownership path of a file.
   *
   * @param {!string} filename file to test ownership for.
   * @param {!string} username user to check ownership of.
   * @return {boolean} true if the user is an owner of the file.
   */
  fileHasOwner(filename, username) {
    return this.atPath(filename).fileRules(filename).some(rule =>
      rule.owners.some(owner => owner.includes(username))
    );
  }

  /**
   * Builds the map from filenames to ownership subtrees.
   *
   * @param {string[]} filenames list of changed files.
   * @return {FileTreeMap} map from filenames to nearest ownership subtrees.
   */
  buildFileTreeMap(filenames) {
    const fileTreeMap = {};
    filenames.forEach(filename => {
      fileTreeMap[filename] = this.atPath(filename);
    });
    return fileTreeMap;
  }

  /**
   * Renders the ownership tree as a string.
   *
   * @return {string} visual representation of the tree.
   */
  toString() {
    const lines = [];

    const rulePrefix = ' •';
    const childPrefix = '└───';
    const indent = Math.max(0, this.depth - 1) * childPrefix.length;
    const prefix = this.isRoot ? '' : `${' '.repeat(indent)}${childPrefix}`;
    const dirName = this.isRoot
      ? 'ROOT'
      : this.dirPath.split(path.sep).slice(-1);

    lines.push(`${prefix}${dirName}`);
    this.rules.forEach(rule => {
      lines.push(`${' '.repeat(indent)}${rulePrefix} ${rule}`);
    });

    /* eslint-disable-next-line guard-for-in */
    for (const dirName in this.children) {
      lines.push(this.get(dirName).toString());
    }

    return lines.join('\n');
  }
}

module.exports = {OwnersTree};
