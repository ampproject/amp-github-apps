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

const OWNER_MODIFIER = {
  NONE: '',
  NOTIFY: 'always notify',
  SILENT: 'never notify',
  REQUIRE: 'require review',
};

/**
 * An owner of some set of files.
 *
 * TODO(#395): Implement ownership modifiers.
 */
class Owner {
  /**
   * Constructor.
   *
   * @param {string} name readable name identifying the owner user/team.
   * @param {?OWNER_MODIFIER} [modifier=NONE] optional owner modifier.
   */
  constructor(name, modifier) {
    this.name = name;
    this.modifier = modifier || OWNER_MODIFIER.NONE;
  }

  /**
   * Tests if this owner matches a username.
   *
   * @throws {Error} if called on the abstract base `Owner` class.
   * @param {string} username username to check.
   */
  includes(username) {
    throw new Error('Not implemented for abstract class `Owner`');
  }

  /**
   * Returns a list of all usernames included by the owner.
   *
   * @return {!Array<string>} list of GitHub usernames.
   */
  get allUsernames() {
    return [];
  }

  /**
   * Render the owner list as a string
   *
   * @throws {Error} if called on the abstract base `Owner` class.
   */
  get _ownerListString() {
    throw new Error('Not implemented for abstract class `Owner`');
  }

  /**
   * Renders the modifier string.
   *
   * @return {string} the modifier in parentheses if any, else empty string.
   */
  get _modString() {
    return this.modifier ? ` (${this.modifier})` : '';
  }

  /**
   * Renders the owner as a string.
   *
   * @return {string} the string representation of the owner.
   */
  toString() {
    return `${this._ownerListString}${this._modString}`;
  }
}

/**
 * A user who owns a set of files.
 */
class UserOwner extends Owner {
  /**
   * Constructor.
   *
   * @param {string} username owner's GitHub username.
   * @param {?OWNER_MODIFIER} [modifier=NONE] optional owner modifier.
   */
  constructor(username, modifier) {
    super(username, modifier);
    Object.assign(this, {username});
  }

  /**
   * Tests if this owner matches a username.
   *
   * @param {string} username username to check.
   * @return {boolean} true if this owner has the username.
   */
  includes(username) {
    return this.username === username;
  }

  /**
   * Returns a list of all usernames included by the owner.
   *
   * @return {!Array<string>} list containing the user's GitHub username.
   */
  get allUsernames() {
    return [this.username];
  }

  /**
   * Render the owner as a string.
   *
   * @return {string} the owner's username.
   */
  get _ownerListString() {
    return this.username;
  }
}

/**
 * A team which owns some set of files.
 */
class TeamOwner extends Owner {
  /**
   * Constructor.
   *
   * @param {!Team} team the GitHub team.
   * @param {?OWNER_MODIFIER} [modifier=NONE] optional owner modifier.
   */
  constructor(team, modifier) {
    super(team.toString(), modifier);
    Object.assign(this, {team});
  }

  /**
   * Tests if this owner matches a username.
   *
   * @param {string} username username to check.
   * @return {boolean} true if this team owner has the username.
   */
  includes(username) {
    return this.team.members.includes(username);
  }

  /**
   * Returns a list of all usernames included by the owner.
   *
   * @return {!Array<string>} list containing the user's GitHub username.
   */
  get allUsernames() {
    return this.team.members;
  }

  /**
   * Render the owner list as a string.
   *
   * @return {string} the team members' usernames as a comma-separated list.
   */
  get _ownerListString() {
    return `${this.name} [${this.team.members.join(', ')}]`;
  }
}

/**
 * A wildcard owner that includes anyone.
 */
class WildcardOwner extends Owner {
  /**
   * Constructor.
   *
   * @param {?OWNER_MODIFIER} [modifier=NONE] optional owner modifier.
   */
  constructor(modifier) {
    if (modifier && modifier != OWNER_MODIFIER.NONE) {
      throw new Error('Modifiers not supported on wildcard `*` owner');
    }
    super('*');
  }

  /**
   * Tests if this owner matches a username.
   *
   * @param {string} unusedUsername username to check.
   * @return {boolean} always true
   */
  includes(unusedUsername) {
    return true;
  }

  /**
   * Render the wildcard owner as a string.
   *
   * @return {string} the `*` wildcard symbol.
   */
  get _ownerListString() {
    return '*';
  }
}

module.exports = {Owner, UserOwner, TeamOwner, WildcardOwner, OWNER_MODIFIER};
