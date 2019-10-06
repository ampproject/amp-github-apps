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
const JSON5 = require('json5');
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
   * @param {!string} ownersPath OWNERS file path (for error reporting).
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
 * Parser for OWNERS files.
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
   * @deprecated
   * @param {!string} ownersPath OWNERS file path (for error reporting).
   * @param {!string} owner owner username.
   * @return {OwnersParserResult<Owner[]>} list of owners.
   */
  _legacyParseOwnersLine(ownersPath, owner) {
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
   * @deprecated
   * @param {!string} ownersPath OWNERS file path (for error reporting).
   * @param {string[]} ownersList list of owners.
   * @return {OwnersParserResult<Owner[]>} list of owners' usernames.
   */
  _legacyParseOwnersList(ownersPath, ownersList) {
    const owners = [];
    const errors = [];

    ownersList.forEach(owner => {
      const lineResult = this._legacyParseOwnersLine(ownersPath, owner);
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
   * @deprecated
   * @param {!string} ownersPath OWNERS file path (for error reporting).
   * @param {!object} ownersDict dictionary with a pattern as the key and a list
   * of owners as the value.
   * @return {OwnersParserResult<PatternOwnersRule[]>} parsed OWNERS pattern
   *     rule.
   */
  _legacyParseOwnersDict(ownersPath, ownersDict) {
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
        const lineResult = this._legacyParseOwnersLine(ownersPath, ownersList);
        owners.push(...lineResult.result);
        errors.push(...lineResult.errors);
      } else {
        ownersList.forEach(owner => {
          if (typeof owner === 'string') {
            const lineResult = this._legacyParseOwnersLine(ownersPath, owner);
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
   * Parse an OWNERS file.
   *
   * @deprecated
   * @param {!string} ownersPath OWNERS file path (for error reporting).
   * @return {OwnersParserResult<OwnersRule[]>} parsed OWNERS file rule.
   */
  _parseYamlOwnersFile(ownersPath) {
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

      const fileOwners = this._legacyParseOwnersList(ownersPath, stringLines);
      errors.push(...fileOwners.errors);
      if (fileOwners.result.length) {
        rules.push(new OwnersRule(ownersPath, fileOwners.result));
      }

      const dictLines = lines.filter(line => typeof line === 'object');
      dictLines.forEach(dict => {
        const dictResult = this._legacyParseOwnersDict(ownersPath, dict);
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
   * Parse an owner definition.
   *
   * @param {!string} ownersPath OWNERS.json file path (for error reporting).
   * @param {!OwnerDefinition} ownerDef owners definition.
   * @return {OwnersParserResult<?Owner>} parsed owner.
   */
  _parseOwnerDefinition(ownersPath, ownerDef) {
    const errors = [];

    // Validate the owner definition itself.
    if (typeof ownerDef !== 'object') {
      errors.push(
        new OwnersParserError(
          ownersPath,
          `Expected owner definition; got ${typeof ownerDef}`
        )
      );
      return {errors};
    }

    // Validate and sanitize the owner name.
    let ownerName = ownerDef.name;
    if (typeof ownerName !== 'string') {
      errors.push(
        new OwnersParserError(
          ownersPath,
          `Expected "name" to be a string; got ${typeof ownerName}`
        )
      );
      return {errors};
    }
    ownerName = ownerName.toLowerCase();

    if (ownerName.startsWith('@')) {
      errors.push(
        new OwnersParserError(
          ownersPath,
          `Ignoring unnecessary '@' in '${ownerName}'`
        )
      );
      ownerName = ownerName.slice(1);
    }

    // Validate and determine modifier.
    let modifier = OWNER_MODIFIER.NONE;
    const notify = ownerDef.notify === undefined ? false : ownerDef.notify;
    const requestReviews =
      ownerDef.requestReviews === undefined ? true : ownerDef.requestReviews;

    if (notify && !requestReviews) {
      errors.push(
        new OwnersParserError(
          ownersPath,
          'Cannot specify both "notify: true" and "requestReviews: false"; ' +
            'ignoring modifiers'
        )
      );
    } else if (notify) {
      modifier = OWNER_MODIFIER.NOTIFY;
    } else if (!requestReviews) {
      modifier = OWNER_MODIFIER.SILENT;
    }

    // Determine the owner from the name.
    if (ownerName.includes('/')) {
      const team = this.teamMap[ownerName];

      if (team) {
        return {errors, result: new TeamOwner(team, modifier)};
      } else {
        errors.push(
          new OwnersParserError(ownersPath, `Unrecognized team: '${ownerName}'`)
        );
      }
      return {errors};
    }

    if (ownerName === '*') {
      try {
        return {errors, result: new WildcardOwner(modifier)};
      } catch (error) {
        errors.push(new OwnersParserError(ownersPath, error.message));
        return {errors, result: new WildcardOwner()};
      }
    }

    return {errors, result: new UserOwner(ownerName, modifier)};
  }

  /**
   * Parse an owners rule definition.
   *
   * @param {!string} ownersPath OWNERS.json file path (for error reporting).
   * @param {!RuleDefinition} ruleDef owners rule definition.
   * @return {OwnersParserResult<?OwnersRule>} parsed rule.
   */
  _parseRuleDefinition(ownersPath, ruleDef) {
    const errors = [];
    const owners = [];

    // Validate rule definition and parse owners list.
    if (typeof ruleDef !== 'object') {
      errors.push(
        new OwnersParserError(
          ownersPath,
          `Expected rule definition; got ${typeof ruleDef}`
        )
      );
    } else if (!(ruleDef.owners instanceof Array)) {
      errors.push(
        new OwnersParserError(
          ownersPath,
          `Expected "owners" to be a list; got ${typeof ruleDef.owners}`
        )
      );
    } else {
      ruleDef.owners.forEach(ownerDef => {
        const ownerParse = this._parseOwnerDefinition(ownersPath, ownerDef);
        if (ownerParse.result) {
          owners.push(ownerParse.result);
        }
        errors.push(...ownerParse.errors);
      });
    }

    if (!owners.length) {
      errors.push(
        new OwnersParserError(
          ownersPath,
          'No valid owners found; skipping rule'
        )
      );
      return {errors};
    }

    // Validate rule pattern, if present.
    let pattern = ruleDef.pattern;
    if (pattern && typeof pattern !== 'string') {
      errors.push(
        new OwnersParserError(
          ownersPath,
          `Expected "pattern" to be a string; got ${typeof pattern}`
        )
      );
      return {errors};
    }

    const isRecursive = pattern && pattern.startsWith(GLOB_PATTERN);
    if (pattern) {
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
        return {errors};
      }
    }

    // Create rule based on pattern and owners list.
    let rule;
    if (pattern && isRecursive) {
      rule = new PatternOwnersRule(ownersPath, owners, pattern);
    } else if (pattern) {
      rule = new SameDirPatternOwnersRule(ownersPath, owners, pattern);
    } else {
      rule = new OwnersRule(ownersPath, owners);
    }

    return {errors, result: rule};
  }

  /**
   * Parse an OWNERS.json file.
   *
   * @param {!string} ownersPath OWNERS.json file path (for error reporting).
   * @param {!OwnersFileDefinition} fileDef owners file definition.
   * @return {OwnersParserResult<OwnersRule[]>} parsed OWNERS file rules.
   */
  parseOwnersFileDefinition(ownersPath, fileDef) {
    const rules = [];
    const errors = [];

    if (fileDef.rules instanceof Array) {
      fileDef.rules.forEach(ruleDef => {
        const ruleParse = this._parseRuleDefinition(ownersPath, ruleDef);
        if (ruleParse.result) {
          rules.push(ruleParse.result);
        }
        errors.push(...ruleParse.errors);
      });
    } else {
      errors.push(
        new OwnersParserError(
          ownersPath,
          'Failed to parse file; top-level "rules" key must contain a list'
        )
      );
    }

    return {result: rules, errors};
  }

  /**
   * Parse an OWNERS.json file.
   *
   * @param {!string} ownersPath OWNERS.json file path (for error reporting).
   * @return {OwnersParserResult<OwnersRule[]>} parsed OWNERS file rule.
   */
  _parseJsonOwnersFile(ownersPath) {
    const errors = [];
    const contents = this.localRepo.readFile(ownersPath);

    let file;
    try {
      file = JSON5.parse(contents);
    } catch (error) {
      errors.push(new OwnersParserError(ownersPath, error.toString()));
      return {errors, result: []};
    }

    return this.parseOwnersFileDefinition(ownersPath, file);
  }

  /**
   * Parse an OWNERS file in YAML or JSON format.
   *
   * @param {!string} ownersPath OWNERS file path (for error reporting).
   * @return {OwnersParserResult<OwnersRule[]>} parsed OWNERS file rules.
   */
  parseOwnersFile(ownersPath) {
    if (ownersPath.toLowerCase().endsWith('.yaml')) {
      return this._parseYamlOwnersFile(ownersPath);
    }
    return this._parseJsonOwnersFile(ownersPath);
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
