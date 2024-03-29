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

const Ajv = require('ajv');
const JSON5 = require('json5');
const OwnersTree = require('./tree');
const SCHEMA = require('./schema');
const {
  OwnersRule,
  PatternOwnersRule,
  SameDirPatternOwnersRule,
  ReviewerSetRule,
} = require('./rules');
const {
  UserOwner,
  TeamOwner,
  WildcardOwner,
  OWNER_MODIFIER,
} = require('./owner');

const GLOB_PATTERN = '**/';
const validate = new Ajv({allErrors: true}).compile(SCHEMA);

/**
 * An error encountered parsing an OWNERS file
 */
class OwnersParserError extends Error {
  /**
   * Constructor
   *
   * @param {string} ownersPath OWNERS file path (for error reporting).
   * @param {string} message error message;
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
   * @param {!Repository} repo local repository to read from.
   * @param {!Object<string, !Team>} teamMap map from team slugs to teams.
   */
  constructor(repo, teamMap) {
    this.repo = repo;
    this.teamMap = teamMap;
  }

  /**
   * Parse the modifier from an owner definition.
   *
   * @param {string} ownersPath OWNERS.json file path (for error reporting).
   * @param {!OwnerDefinition} ownerDef owners definition.
   * @return {!OwnersParserResult<!OWNER_MODIFIER>} parsed owner modifier.
   */
  _parseOwnerDefinitionModifier(ownersPath, ownerDef) {
    let modifier = OWNER_MODIFIER.NONE;
    const errors = [];
    const defaultOptions = {
      notify: false,
      requestReviews: true,
      required: false,
    };
    ownerDef = Object.assign(defaultOptions, ownerDef);

    if (ownerDef.notify) {
      modifier = OWNER_MODIFIER.NOTIFY;
    } else if (!ownerDef.requestReviews) {
      modifier = OWNER_MODIFIER.SILENT;
    } else if (ownerDef.required) {
      modifier = OWNER_MODIFIER.REQUIRE;
    }

    return {errors, result: modifier};
  }

  /**
   * Parse an owner definition.
   *
   * @param {string} ownersPath OWNERS.json file path (for error reporting).
   * @param {!OwnerDefinition} ownerDef owners definition.
   * @return {!OwnersParserResult<?Owner>} parsed owner.
   */
  _parseOwnerDefinition(ownersPath, ownerDef) {
    const errors = [];
    const ownerName = ownerDef.name.toLowerCase();

    // Validate and determine modifier.
    const modParse = this._parseOwnerDefinitionModifier(ownersPath, ownerDef);
    const modifier = modParse.result;
    errors.push(...modParse.errors);

    // Determine the owner from the name.
    if (ownerName.includes('/')) {
      const team = this.teamMap[ownerName];

      if (!team) {
        errors.push(
          new OwnersParserError(ownersPath, `Unrecognized team: '${ownerName}'`)
        );
        return {errors};
      }
      return {errors, result: new TeamOwner(team, modifier)};
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
   * @param {string} ownersPath OWNERS.json file path (for error reporting).
   * @param {!RuleDefinition} ruleDef owners rule definition.
   * @return {!OwnersParserResult<?OwnersRule>} parsed rule.
   */
  _parseRuleDefinition(ownersPath, ruleDef) {
    const errors = [];
    const owners = [];

    ruleDef.owners.forEach(ownerDef => {
      const ownerParse = this._parseOwnerDefinition(ownersPath, ownerDef);
      if (ownerParse.result) {
        owners.push(ownerParse.result);
      }
      errors.push(...ownerParse.errors);
    });

    // Validate rule pattern, if present.
    let pattern = ruleDef.pattern;
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

    // Check that there are no singleton patterns in brace-expansion format. The
    // minimatch glob parsing library performs brace-expansion, but only if the
    // braces contain comma-separated patterns. This is not obvious behavior,
    // and has resulted in broken owners rules.
    // Ex. `{a,b}.js` becomes /(a|b)\.js/
    // Ex. `{a}.js` becomes /\{a\}\.js/
    if (/\{[^,]+\}/.test(pattern)) {
      errors.push(
        new OwnersParserError(
          ownersPath,
          `Brace expansion attempted in pattern '${ruleDef.pattern}', but ` +
            'braces only contain one pattern! Please remove the extra braces.'
        )
      );
      return {errors};
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
   * @param {string} ownersPath OWNERS.json file path (for error reporting).
   * @param {!OwnersFileDefinition} fileDef owners file definition.
   * @return {!OwnersParserResult<!Array<!OwnersRule>>} parsed OWNERS rules.
   */
  parseOwnersFileDefinition(ownersPath, fileDef) {
    const rules = [];
    const errors = [];

    validate(fileDef);
    if (validate.errors) {
      validate.errors.forEach(({instancePath, message}) =>
        errors.push(
          new OwnersParserError(
            ownersPath,
            `\`${ownersPath}${instancePath}\` ${message}`
          )
        )
      );
      return {result: rules, errors};
    }

    if (fileDef.reviewerPool) {
      try {
        const reviewerPool = [];
        // Try to parse each member of the reviewer pool
        fileDef.reviewerPool.forEach(reviewer => {
          const poolParse = this._parseOwnerDefinition(ownersPath, {
            name: reviewer,
          });
          if (poolParse.result) {
            reviewerPool.push(poolParse.result);
          }
          if (poolParse.errors) {
            errors.push(...poolParse.errors);
          }
        });
        if (reviewerPool.length) {
          rules.push(new ReviewerSetRule(ownersPath, reviewerPool));
        }
      } catch (error) {
        errors.push(new OwnersParserError(ownersPath, error.message));
      }
    }

    fileDef.rules.forEach(ruleDef => {
      const ruleParse = this._parseRuleDefinition(ownersPath, ruleDef);
      if (ruleParse.result) {
        rules.push(ruleParse.result);
      }
      errors.push(...ruleParse.errors);
    });

    return {result: rules, errors};
  }

  /**
   * Parse an OWNERS.json file.
   *
   * @param {string} ownersPath OWNERS.json file path (for error reporting).
   * @return {!OwnersParserResult<!Array<!OwnersRule>>} parsed OWNERS rules.
   */
  async parseOwnersFile(ownersPath) {
    const errors = [];

    let file;
    try {
      const contents = await this.repo.readFile(ownersPath);
      file = JSON5.parse(contents);
    } catch (error) {
      errors.push(new OwnersParserError(ownersPath, error.toString()));
      return {errors, result: []};
    }

    return this.parseOwnersFileDefinition(ownersPath, file);
  }

  /**
   * Parse all OWNERS rules in the repo.
   *
   * TODO: Replace this with `parseAllOwnersRulesForFiles` to reduce OWNERS file
   * reads
   *
   * @return {!OwnersParserResult<!Array<!OwnersRule>>} a list of all rules
   *     defined in the local repo.
   */
  async parseAllOwnersRules() {
    const ownersPaths = await this.repo.findOwnersFiles();
    const rules = [];
    const errors = [];

    for (const ownersPath of ownersPaths) {
      const fileParse = await this.parseOwnersFile(ownersPath);
      rules.push(...fileParse.result);
      errors.push(...fileParse.errors);
    }

    return {
      result: rules,
      errors,
    };
  }

  /**
   * Parse all OWNERS rules into a tree.
   *
   * @return {!OwnersParserResult<!OwnersTree>} owners rule hierarchy.
   */
  async parseOwnersTree() {
    const tree = new OwnersTree();
    const ruleParse = await this.parseAllOwnersRules();
    ruleParse.result.forEach(rule => tree.addRule(rule));

    return {result: tree, errors: ruleParse.errors};
  }
}

module.exports = {OwnersParser, OwnersParserError};
