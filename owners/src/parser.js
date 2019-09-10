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

const yaml = require('yamljs');
const {OwnersRule} = require('./rules');
const {OwnersTree} = require('./owners_tree');

/**
 * An error encountered parsing an OWNERS file
 */
class OwnersParserError extends Error {
  /**
   * Displays the error message.
   *
   * @return {string} error message.
   */
  toString() {
    return `OwnersParserError: ${this.message}`;
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
   * @param {!Logger=} logger logging interface (defaults to console).
   */
  constructor(localRepo, logger) {
    this.localRepo = localRepo;
    this.logger = logger || console;
  }

  /**
   * Parse an OWNERS.yaml file.
   *
   * @param {!string} ownersPath OWNERS.yaml file path.
   * @return {OwnersParserResult<OwnersRule[]>} parsed OWNERS file rule.
   */
  parseOwnersFile(ownersPath) {
    const contents = this.localRepo.readFile(ownersPath);
    const lines = yaml.parse(contents);
    const errors = [];
    const rules = [];

    if (lines instanceof Array) {
      const stringLines = lines.filter(line => typeof line === 'string');
      const ownersList = stringLines.filter(line => line.indexOf('/') === -1);
      if (ownersList.length) {
        rules.push(new OwnersRule(ownersPath, ownersList));
      }
    } else {
      errors.push(
        new OwnersParserError(
          `Failed to parse file '${ownersPath}'; must be a YAML list`
        )
      );
    }

    return {rules, errors};
  }

  /**
   * Parse all OWNERS rules in the repo.
   *
   * TODO: Replace this with `parseAllOwnersRulesForFiles` to reduce OWNERS file
   * reads
   *
   * @return {OwnersParserResult<OwnersRule[]>} a list of all rules defined in the local repo.
   */
  async parseAllOwnersRules() {
    const ownersPaths = await this.localRepo.findOwnersFiles();
    const allRules = [];
    const allErrors = [];

    ownersPaths.forEach(ownersPath => {
      const {rules, errors} = this.parseOwnersFile(ownersPath);
      allRules.push(...rules);
      allErrors.push(...errors);
    });

    return {
      rules: allRules,
      errors: allErrors,
    };
  }

  /**
   * Parse all OWNERS rules into a tree.
   *
   * @return {{tree: OwnersTree, errors: OwnersParserError[]}} owners rule hierarchy.
   */
  async parseOwnersTree() {
    const tree = new OwnersTree(this.localRepo.rootPath);
    const {rules, errors} = await this.parseAllOwnersRules();
    rules.forEach(rule => tree.addRule(rule));
    return {tree, errors};
  }
}

module.exports = {OwnersParser, OwnersParserError};
