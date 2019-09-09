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
   * @return {OwnersRule} parsed OWNERS file rule.
   */
  parseOwnersFile(ownersPath) {
    const contents = this.localRepo.readFile(ownersPath);
    const lines = yaml.parse(contents);

    if (!(lines instanceof Array)) {
      this.logger.warn(
        `Failed to parse file '${ownersPath}'; must be a YAML list`
      );
      return null;
    }

    const stringLines = lines.filter(line => typeof line === 'string');
    const ownersList = stringLines.filter(line => line.indexOf('/') === -1);

    return ownersList.length ? new OwnersRule(ownersPath, ownersList) : null;
  }

  /**
   * Parse all OWNERS rules in the repo.
   *
   * TODO: Replace this with `parseAllOwnersRulesForFiles` to reduce OWNERS file
   * reads
   *
   * @return {OwnersRule[]} a list of all rules defined in the local repo.
   */
  async parseAllOwnersRules() {
    const ownersPaths = await this.localRepo.findOwnersFiles();
    return ownersPaths
      .map(ownersPath => this.parseOwnersFile(ownersPath))
      .filter(rule => rule !== null);
  }

  /**
   * Parse all OWNERS rules into a tree.
   *
   * @return {OwnersTree} owners rule hierarchy.
   */
  async parseOwnersTree() {
    const tree = new OwnersTree(this.localRepo.rootPath);
    const rules = await this.parseAllOwnersRules();
    rules.forEach(rule => tree.addRule(rule));
    return tree;
  }
}

module.exports = {OwnersParser};
