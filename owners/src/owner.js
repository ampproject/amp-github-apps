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

/**
 * An owner of some set of files.
 *
 * TODO(#395): Implement ownership modifiers.
 */
class Owner {
  /**
   * Tests if this owner matches a username.
   *
   * @throws {Error} if called on the abstract base `Owner` class.
   * @param {!string} username username to check.
   */
  includes(username) {
    throw new Error('Not implemented for abstract class `Owner`');
  }

  /**
   * Returns a list of all usernames included by the owner.
   *
   * @return {string[]} list of GitHub usernames.
   */
  get allUsernames() {
    return [];
  }
}

/**
 * A user who owns a set of files.
 */
class UserOwner extends Owner {
  /**
   * Constructor.
   *
   * @param {!string} username owner's GitHub username.
   */
  constructor(username) {
    super();
    Object.assign(this, {username});
  }

  /**
   * Tests if this owner matches a username.
   *
   * @param {!string} username username to check.
   * @return {boolean} true if this owner has the username.
   */
  includes(username) {
    return this.username === username;
  }

  /**
   * Returns a list of all usernames included by the owner.
   *
   * @return {string[]} list containing the user's GitHub username.
   */
  get allUsernames() {
    return [this.username];
  }

  /**
   * Render the owner as a string.
   *
   * @return {string} the owner's username.
   */
  toString() {
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
   */
  constructor(team) {
    super();
    Object.assign(this, {team});
  }

  /**
   * Tests if this owner matches a username.
   *
   * @param {!string} username username to check.
   * @return {boolean} true if this team owner has the username.
   */
  includes(username) {
    return this.team.members.includes(username);
  }

  /**
   * Returns a list of all usernames included by the owner.
   *
   * @return {string[]} list containing the user's GitHub username.
   */
  get allUsernames() {
    return this.team.members;
  }

  /**
   * Render the owner as a string.
   *
   * @return {string} the team members' usernames as a comma-separated list.
   */
  toString() {
    return this.team.members.join(', ');
  }
}

/**
 * A wildcard owner that includes anyone.
 */
class WildcardOwner extends Owner {
  /**
   * Tests if this owner matches a username.
   *
   * @param {!string} unusedUsername username to check.
   * @return {boolean} always true
   */
  includes(unusedUsername) {
    return true;
  }

  /**
   * Render the owner as a string.
   *
   * @return {string} the `*` wildcard symbol.
   */
  toString() {
    return '*';
  }
}

module.exports = {Owner, UserOwner, TeamOwner, WildcardOwner};
