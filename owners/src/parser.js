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
   * Constructor
   *
   * @param {!string} ownersPath OWNERS.yaml file path (for error reporting).
   * @param {!string} message error message;
   */
  constructor(ownersPath, message) {
    super(message);
    this.ownersPath = ownersPath;
  }

  /**
   * Displays the error message.
   *
   * @return {string} error message.
   */
  toString() {
    return `OwnersParserError [${this.ownersPath}]: ${this.message}`;
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
   * Parse a single owner declaration.
   *
   * TODO(rcebulko): Add support for teams.
   *
   * @private
   * @param {!string} ownersPath OWNERS.yaml file path (for error reporting).
   * @param {!string} owner owner username.
   * @return {OwnersParserResult<string[]>} list of owners' usernames.
   */
  _parseOwnersLine(ownersPath, owner) {
    const owners = [];
    const errors = [];

    if (owner[0] === '@') {
      const lineResult = this._parseOwnersLine(ownersPath, owner.slice(1));

      owners.push(...lineResult.result);
      errors.push(
        new OwnersParserError(
          ownersPath,
          `Ignoring unnecessary '@' in '${owner}'`
        ),
        ...lineResult.errors
      );
    } else if (owner.indexOf('/') !== -1) {
      errors.push(
        new OwnersParserError(
          ownersPath,
          `Failed to parse owner '${owner}'; team ownership not yet supported`
        )
      );
    } else {
      owners.push(owner);
    }

    return {result: owners, errors};
  }

  /**
   * Parse an OWNERS.yaml file.
   *
   * @param {!string} ownersPath OWNERS.yaml file path (for error reporting).
   * @return {OwnersParserResult<OwnersRule[]>} parsed OWNERS file rule.
   */
  parseOwnersFile(ownersPath) {
    const contents = this.localRepo.readFile(ownersPath);
    const lines = yaml.parse(contents);
    const errors = [];
    const rules = [];

    if (lines instanceof Array) {
      const stringLines = lines.filter(line => typeof line === 'string');

      const ownersList = [];
      stringLines.forEach(line => {
        const lineResult = this._parseOwnersLine(ownersPath, line);
        ownersList.push(...lineResult.result);
        errors.push(...lineResult.errors);
      });

      if (ownersList.length) {
        rules.push(new OwnersRule(ownersPath, ownersList));
      }
    } else {
      errors.push(
        new OwnersParserError(
          ownersPath,
          `Failed to parse file; must be a YAML list`
        )
      );
    }

    return {result: rules, errors};
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
    const rules = [];
    const errors = [];

    ownersPaths.forEach(ownersPath => {
      const fileParse = this.parseOwnersFile(ownersPath);
      rules.push(...fileParse.result);
      errors.push(...fileParse.errors);
    });

    return {
      result: rules,
      errors,
    };
  }

  /**
   * Parse all OWNERS rules into a tree.
   *
   * @return {OwnersParserResult<OwnersTree>} owners rule hierarchy.
   */
  async parseOwnersTree() {
    const tree = new OwnersTree(this.localRepo.rootPath);
    const ruleParse = await this.parseAllOwnersRules();
    ruleParse.result.forEach(rule => tree.addRule(rule));

    return {result: tree, errors: ruleParse.errors};
  }
}

module.exports = {OwnersParser, OwnersParserError};
