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

const minimatch = require('minimatch');
const path = require('path');
const {WildcardOwner} = require('./owner');

/**
 * The priority level for a rule.
 *
 * Since reviewer selection targets the most-specific rules, it should consider
 * patterns to be more specific than directory owners. These priorities are used
 * to determine which set of rules are the most specific so they can be targeted
 * first.
 */
const RULE_PRIORITY = {
  DIRECTORY: 1,
  RECURSIVE_PATTERN: 2,
  SAME_DIRECTORY_PATTERN: 3,
};

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
   * @param {string} ownersPath path to OWNERS file.
   * @param {!Array<!Owner>} owners list of owners.
   */
  constructor(ownersPath, owners) {
    this.filePath = ownersPath;
    this.dirPath = path.dirname(ownersPath);
    this.owners = owners;
    this.priority = RULE_PRIORITY.DIRECTORY;
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
   * @param {string} filePath relative path in repo to the file being checked.
   * @return {boolean} true if the rule applies to the file.
   */
  matchesFile(unusedFilePath) {
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
   * @param {string} ownersPath path to OWNERS file.
   * @param {!Array<!Owner>} owners list of owners.
   * @param {string} pattern filename/type pattern.
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
    this.priority = RULE_PRIORITY.RECURSIVE_PATTERN;
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
   * @param {string} filePath relative path in repo to the file being checked.
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
   * Constructor.
   *
   * @param {string} ownersPath path to OWNERS file.
   * @param {!Array<!Owner>} owners list of owners.
   * @param {string} pattern filename/type pattern.
   */
  constructor(ownersPath, owners, pattern) {
    super(ownersPath, owners, pattern);
    this.priority = RULE_PRIORITY.SAME_DIRECTORY_PATTERN;
  }

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
   * @param {string} filePath relative path in repo to the file being checked.
   * @return {boolean} true if the rule applies to the file.
   */
  matchesFile(filePath) {
    return (
      super.matchesFile(filePath) && this.dirPath === path.dirname(filePath)
    );
  }
}

/**
 * A rule which, if present at the root of the ownership tree, requires at least
 * one approving review on any PR regardless of the files it contains.
 */
class ReviewerSetRule extends OwnersRule {
  /**
   * Constructor.
   *
   * @param {string} ownersPath path to OWNERS file.
   * @param {Array<!Owner>=} owners list of owners (defaults to a wildcard owner).
   */
  constructor(ownersPath, owners) {
    if (!owners) {
      owners = [new WildcardOwner()];
    }
    super(ownersPath, owners);

    if (this.dirPath !== '.') {
      throw new Error(
        'A reviewer team rule may only be specified at the repository root'
      );
    }
  }

  /**
   * The label to use when describing the rule.
   *
   * @return {string} the label for the rule.
   */
  get label() {
    return 'Reviewers';
  }
}

module.exports = {
  OwnersRule,
  PatternOwnersRule,
  SameDirPatternOwnersRule,
  ReviewerSetRule,
  RULE_PRIORITY,
};
