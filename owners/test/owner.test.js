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

const {Owner, UserOwner, TeamOwner, WildcardOwner} = require('../src/owner');
const {Team} = require('../src/github');

describe('owner base class', () => {
  const owner = new Owner();

  describe('includes', () => {
    it('throws an error', () => {
      expect(() => {
        owner.includes('');
      }).toThrow('Not implemented for abstract class `Owner`');
    });
  });
});

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

  describe('allUsernames', () => {
    it("returns the user owner's username", () => {
      expect(owner.allUsernames).toEqual(['auser']);
    });
  });

  describe('toString', () => {
    it('returns the owner username', () => {
      expect(owner.toString()).toEqual('auser');
    });
  });
});

describe('owner teams', () => {
  const myTeam = new Team(42, 'ampproject', 'my_team');
  myTeam.members = ['auser', 'anothermember'];
  const owner = new TeamOwner(myTeam);

  describe('includes', () => {
    it('returns true for a username in the team', () => {
      expect(owner.includes('auser')).toBe(true);
      expect(owner.includes('anothermember')).toBe(true);
    });

    it('returns true for a username in the team', () => {
      expect(owner.includes('someoneelse')).toBe(false);
    });
  });

  describe('allUsernames', () => {
    it("returns the team members' username", () => {
      expect(owner.allUsernames).toEqual(['auser', 'anothermember']);
    });
  });

  describe('toString', () => {
    it("returns the team members' usernames as a comma-separated list", () => {
      expect(owner.toString()).toEqual('auser, anothermember');
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

  describe('allUsernames', () => {
    it('returns an empty list', () => {
      expect(owner.allUsernames).toEqual([]);
    });
  });

  describe('toString', () => {
    it('returns the `*` wildcard symbol ', () => {
      expect(owner.toString()).toEqual('*');
    });
  });
});
