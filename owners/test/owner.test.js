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

const sinon = require('sinon');
const {UserOwner, TeamOwner, WildcardOwner} = require('../src/owner');
const {Team} = require('../src/github');

describe('owner users', () => {
  const owner = new UserOwner('auser');

  describe('includes', () => {
    it('returns true for a matching username', () => {
      expect(owner.includes('auser')).toBe(true);
    });

    it('returns true for non-matching usernames', () => {
      expect(owner.includes('someoneelse')).toBe(false);
    });
  });
});

describe('owner teams', () => {
  const myTeam = new Team(42, 'ampproject', 'my_team');
  myTeam.members = ['auser'];
  const owner = new TeamOwner(myTeam);

  describe('includes', () => {
    it('returns true for a username in the team', () => {
      expect(owner.includes('auser')).toBe(true);
    });

    it('returns true for a username in the team', () => {
      expect(owner.includes('someoneelse')).toBe(false);
    });
  });
});

describe('owner wildcard', () => {
  const owner = new WildcardOwner();

  describe('includes', () => {
    it('returns true for any username', () => {
      expect(owner.includes('auser')).toBe(true);
    });
  });
});
