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
const minimatch = require('minimatch');

/**
 * A rule describing ownership for a directory.
 */
class OwnersRule {
  /**
   * Constructor.
   *
   * If a rule's owners includes the `*` wildcard, the rule will be satisfied by
   * any reviewer.
   *
   * @param {!string} ownersPath path to OWNERS file.
   * @param {string[]} owners list of GitHub usernames of owners.
   */
  constructor(ownersPath, owners) {
    this.filePath = ownersPath;
    this.dirPath = path.dirname(ownersPath);
    this.owners = owners;
  }

  /**
   * The label to use when describing the rule.
   *
   * @return {string} the label for the rule.
   */
  get label() {
    return '**/*';
  }

  /**
   * Test if a file is matched by the rule.
   *
   * Currently is always true, as it assumes that the rule is being tested on;
   * files within its hierarchy; may be modified to test filetypes, globs,
   * special cases like package.json, etc.
   *
   * TODO(Issue #278): Implement pattern matching.
   *
   * @param {!string} filePath relative path in repo to the file being checked.
   * @return {boolean} true if the rule applies to the file.
   */
  matchesFile(filePath) {
    return true;
  }

  /**
   * Describe the rule.
   *
   * @return {string} description of the rule.
   */
  toString() {
    return `${this.label}: ${this.owners.join(', ')}`;
  }
}

/**
 * A pattern-based ownership rule applying to all matching files in the
 * directory and all subdirectories.
 *
 * Treats `*` as a wildcard glob pattern; all other characters are treated as
 * literals.
 */
class PatternOwnersRule extends OwnersRule {
  /**
   * Constructor.
   *
   * @param {!string} ownersPath path to OWNERS file.
   * @param {string[]} owners list of GitHub usernames of owners.
   * @param {!string} pattern filename/type pattern.
   */
  constructor(ownersPath, owners, pattern) {
    super(ownersPath, owners);
    this.pattern = pattern;
    this.regex = minimatch.makeRe(pattern, {
      matchBase: true,
      noglobstar: true,
      noext: true,
      nocase: true,
      nocomment: true,
      nonegate: true,
    });
  }

  /**
   * The label to use when describing the rule.
   *
   * @return {string} the label for the rule.
   */
  get label() {
    return `**/${this.pattern}`;
  }

  /**
   * Test if a file is matched by the pattern rule.
   *
   * @param {!string} filePath relative path in repo to the file being checked.
   * @return {boolean} true if the rule applies to the file.
   */
  matchesFile(filePath) {
    return this.regex.test(path.basename(filePath));
  }
}

/**
 * A pattern-based ownership rule applying only to files in the same directory.
 */
class SameDirPatternOwnersRule extends PatternOwnersRule {
  /**
   * The label to use when describing the rule.
   *
   * @return {string} the label for the rule.
   */
  get label() {
    return `./${this.pattern}`;
  }

  /**
   * Test if a file is in the rule directory and matched by the pattern rule.
   *
   * @param {!string} filePath relative path in repo to the file being checked.
   * @return {boolean} true if the rule applies to the file.
   */
  matchesFile(filePath) {
    return (
      super.matchesFile(filePath) && this.dirPath === path.dirname(filePath)
    );
  }
}

module.exports = {OwnersRule, PatternOwnersRule, SameDirPatternOwnersRule};
