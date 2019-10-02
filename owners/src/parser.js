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
const {
  OwnersRule,
  PatternOwnersRule,
  SameDirPatternOwnersRule,
} = require('./rules');
const {OwnersTree} = require('./owners_tree');
const {
  UserOwner,
  TeamOwner,
  WildcardOwner,
  OWNER_MODIFIER,
} = require('./owner');

const GLOB_PATTERN = '**/';

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
   * @param {!Object<!string, !Team>} teamMap map from team slugs to teams.
   * @param {!Logger=} logger logging interface (defaults to console).
   */
  constructor(localRepo, teamMap, logger) {
    this.localRepo = localRepo;
    this.teamMap = teamMap;
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
   * @return {OwnersParserResult<Owner[]>} list of owners.
   */
  _parseOwnersLine(ownersPath, owner) {
    const owners = [];
    const errors = [];
    let modifier = OWNER_MODIFIER.NONE;

    owner = owner.toLowerCase();

    if (owner.startsWith('?')) {
      modifier = OWNER_MODIFIER.SILENT;
      owner = owner.slice(1);
    } else if (owner.startsWith('#')) {
      modifier = OWNER_MODIFIER.NOTIFY;
      owner = owner.slice(1);
    } else if (owner.startsWith('!')) {
      modifier = OWNER_MODIFIER.REQUIRE;
      owner = owner.slice(1);
    }

    if (owner.startsWith('@')) {
      errors.push(
        new OwnersParserError(
          ownersPath,
          `Ignoring unnecessary '@' in '${owner}'`
        )
      );
      owner = owner.slice(1);
    }

    if (owner.includes('/')) {
      const team = this.teamMap[owner];

      if (team) {
        owners.push(new TeamOwner(team, modifier));
      } else {
        errors.push(
          new OwnersParserError(ownersPath, `Unrecognized team: '${owner}'`)
        );
      }
    } else if (owner === '*') {
      try {
        owners.push(new WildcardOwner(modifier));
      } catch (error) {
        errors.push(new OwnersParserError(ownersPath, error.message));
        owners.push(new WildcardOwner());
      }
    } else {
      owners.push(new UserOwner(owner, modifier));
    }

    return {result: owners, errors};
  }

  /**
   * Parse a list of owners.
   *
   * @private
   * @param {!string} ownersPath OWNERS.yaml file path (for error reporting).
   * @param {string[]} ownersList list of owners.
   * @return {OwnersParserResult<Owner[]>} list of owners' usernames.
   */
  _parseOwnersList(ownersPath, ownersList) {
    const owners = [];
    const errors = [];

    ownersList.forEach(owner => {
      const lineResult = this._parseOwnersLine(ownersPath, owner);
      owners.push(...lineResult.result);
      errors.push(...lineResult.errors);
    });

    return {result: owners, errors};
  }

  /**
   * Parse an owners dictionary as a pattern-based rule.
   *
   * Note: All YAML parsed dictionaries have a single key-value pair; a dict not
   * matching this will not be parsed correctly.
   *
   * @private
   * @param {!string} ownersPath OWNERS.yaml file path (for error reporting).
   * @param {!object} ownersDict dictionary with a pattern as the key and a list
   * of owners as the value.
   * @return {OwnersParserResult<PatternOwnersRule[]>} parsed OWNERS pattern
   *     rule.
   */
  _parseOwnersDict(ownersPath, ownersDict) {
    const [[fullPattern, ownersList]] = Object.entries(ownersDict);
    const rules = [];
    const errors = [];
    let patternList = [];

    // TODO(rcebulko): Remove backwards-compatibility once all owners files have
    // been updated to use brace syntax.
    if (!fullPattern.includes('{')) {
      patternList = fullPattern.split(/\s*,\s*/);
    } else {
      patternList = [fullPattern];
    }

    patternList.forEach(pattern => {
      const owners = [];
      const isRecursive = pattern.startsWith(GLOB_PATTERN);
      if (isRecursive) {
        pattern = pattern.slice(GLOB_PATTERN.length);
      }

      if (pattern.includes('/')) {
        errors.push(
          new OwnersParserError(
            ownersPath,
            `Failed to parse rule for pattern '${pattern}'; ` +
              `directory patterns other than '${GLOB_PATTERN}' not supported`
          )
        );
      } else if (typeof ownersList === 'string') {
        const lineResult = this._parseOwnersLine(ownersPath, ownersList);
        owners.push(...lineResult.result);
        errors.push(...lineResult.errors);
      } else {
        ownersList.forEach(owner => {
          if (typeof owner === 'string') {
            const lineResult = this._parseOwnersLine(ownersPath, owner);
            owners.push(...lineResult.result);
            errors.push(...lineResult.errors);
          } else {
            errors.push(
              new OwnersParserError(
                ownersPath,
                `Failed to parse owner of type ${typeof owner} for pattern ` +
                  `rule '${pattern}'`
              )
            );
          }
        });
      }

      if (owners.length) {
        if (isRecursive) {
          rules.push(new PatternOwnersRule(ownersPath, owners, pattern));
        } else {
          rules.push(new SameDirPatternOwnersRule(ownersPath, owners, pattern));
        }
      }
    });

    return {result: rules, errors};
  }

  /**
   * Parse an OWNERS.yaml file.
   *
   * @param {!string} ownersPath OWNERS.yaml file path (for error reporting).
   * @return {OwnersParserResult<OwnersRule[]>} parsed OWNERS file rule.
   */
  parseOwnersFile(ownersPath) {
    const contents = this.localRepo.readFile(ownersPath);

    let lines;
    try {
      lines = yaml.parse(contents);
    } catch (error) {
      return {
        result: [],
        errors: [new OwnersParserError(ownersPath, error.toString())],
      };
    }

    const errors = [];
    const rules = [];

    if (lines instanceof Array) {
      const stringLines = lines.filter(line => typeof line === 'string');

      const fileOwners = this._parseOwnersList(ownersPath, stringLines);
      errors.push(...fileOwners.errors);
      if (fileOwners.result.length) {
        rules.push(new OwnersRule(ownersPath, fileOwners.result));
      }

      const dictLines = lines.filter(line => typeof line === 'object');
      dictLines.forEach(dict => {
        const dictResult = this._parseOwnersDict(ownersPath, dict);
        rules.push(...dictResult.result);
        errors.push(...dictResult.errors);
      });
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
   * @return {OwnersParserResult<OwnersRule[]>} a list of all rules defined in
   *     the local repo.
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
