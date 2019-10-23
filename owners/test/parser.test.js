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
const path = require('path');
const fs = require('fs');
const JSON5 = require('json5');
const {Team} = require('../src/api/github');
const LocalRepository = require('../src/repo/local_repo');
const {OwnersParser, OwnersParserError} = require('../src/parser');
const {
  UserOwner,
  TeamOwner,
  WildcardOwner,
  OWNER_MODIFIER,
} = require('../src/owner');
const {
  OwnersRule,
  PatternOwnersRule,
  SameDirPatternOwnersRule,
  ReviewerSetRule,
} = require('../src/rules');

const EXAMPLE_FILE_PATH = path.resolve(__dirname, '../OWNERS.example');

describe('owners parser error', () => {
  describe('toString', () => {
    const error = new OwnersParserError('foo/OWNERS', 'Oops!');

    it('displays the file containing the error', () => {
      expect(error.toString()).toContain('[foo/OWNERS]');
    });

    it('displays the error message', () => {
      expect(error.toString()).toContain('Oops!');
    });
  });
});

describe('owners parser', () => {
  const sandbox = sinon.createSandbox();
  let repo;
  let parser;
  let myTeam;
  const wgCool = new Team(1, 'ampproject', 'wg-cool-team');
  const wgCaching = new Team(2, 'ampproject', 'wg-caching');
  const wgInfra = new Team(3, 'ampproject', 'wg-infra');
  const reviewerTeam = new Team(0, 'ampproject', 'reviewers-amphtml');

  beforeEach(() => {
    myTeam = new Team(1337, 'ampproject', 'my_team');
    myTeam.members = ['team_member', 'other_member'];

    repo = new LocalRepository('path/to/repo');
    parser = new OwnersParser(repo, {
      'ampproject/my_team': myTeam,
      'ampproject/wg-cool-team': wgCool,
      'ampproject/wg-caching': wgCaching,
      'ampproject/wg-infra': wgInfra,
      'ampproject/reviewers-amphtml': reviewerTeam,
    });

    sandbox.stub(repo, '_getAbsolutePath').callsFake(relativePath => {
      return `path/to/repo/${relativePath}`;
    });
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe('parseOwnerDefinition', () => {
    describe('when given something not an owner definition', () => {
      it('reports an error', () => {
        const {errors} = parser._parseOwnerDefinition('', 'HELLO!');
        expect(errors[0].message).toEqual(
          'Expected owner definition; got string'
        );
      });

      it('returns no result', () => {
        const {result} = parser._parseOwnerDefinition('', 'HELLO!');
        expect(result).toBeUndefined();
      });
    });

    describe('for a non-string name', () => {
      it('reports an error', () => {
        const {errors} = parser._parseOwnerDefinition('', {name: {}});
        expect(errors[0].message).toEqual(
          'Expected "name" to be a string; got object'
        );
      });

      it('returns no result', () => {
        const {result} = parser._parseOwnerDefinition('', {name: {}});
        expect(result).toBeUndefined();
      });
    });

    describe('for a name with a leading "@"', () => {
      it('reports an error', () => {
        const {errors} = parser._parseOwnerDefinition('', {name: '@me'});
        expect(errors[0].message).toEqual("Ignoring unnecessary '@' in '@me'");
      });

      it('ignores the "@"', () => {
        const {result} = parser._parseOwnerDefinition('', {name: '@me'});
        expect(result).toEqual(new UserOwner('me'));
      });
    });

    describe('modifiers', () => {
      describe('when multiple options are specified', () => {
        it('reports an error', () => {
          const {errors} = parser._parseOwnerDefinition('', {
            name: 'me',
            notify: true,
            requestReviews: false,
          });
          expect(errors[0].message).toContain(
            'Cannot specify more than one of (notify, requestReviews)'
          );
        });

        it('ignores the options', () => {
          const {result} = parser._parseOwnerDefinition('', {
            name: 'me',
            notify: true,
            required: true,
          });
          expect(result.modifier).toBe(OWNER_MODIFIER.NONE);
        });
      });

      it('defaults to no modifier', () => {
        const {result} = parser._parseOwnerDefinition('', {name: 'me'});
        expect(result.modifier).toEqual(OWNER_MODIFIER.NONE);
      });

      it('selects always-notify modifier when "notify" is true', () => {
        const {result} = parser._parseOwnerDefinition('', {
          name: 'me',
          notify: true,
        });
        expect(result.modifier).toEqual(OWNER_MODIFIER.NOTIFY);
      });

      it('selects never-notify modifier when "requestReviews" is false', () => {
        const {result} = parser._parseOwnerDefinition('', {
          name: 'me',
          requestReviews: false,
        });
        expect(result.modifier).toEqual(OWNER_MODIFIER.SILENT);
      });

      it('selects require-review modifier when "required" is true', () => {
        const {result} = parser._parseOwnerDefinition('', {
          name: 'me',
          required: true,
        });
        expect(result.modifier).toEqual(OWNER_MODIFIER.REQUIRE);
      });
    });

    describe('team owner declarations', () => {
      it('returns a team owner', () => {
        const {result} = parser._parseOwnerDefinition('', {
          name: 'ampproject/my_team',
        });
        expect(result).toEqual(new TeamOwner(myTeam));
      });

      describe('when the team is unknown', () => {
        it('reports an error', () => {
          const {errors} = parser._parseOwnerDefinition('', {
            name: 'ampproject/other_team',
          });
          expect(errors[0].message).toEqual(
            "Unrecognized team: 'ampproject/other_team'"
          );
        });

        it('returns no result', () => {
          const {result} = parser._parseOwnerDefinition('', {
            name: 'ampproject/other_team',
          });
          expect(result).toBeUndefined();
        });
      });
    });

    describe('wildcard owner declarations', () => {
      it('parses a wildcard owner', () => {
        const {result} = parser._parseOwnerDefinition('', {name: '*'});
        expect(result).toEqual(new WildcardOwner());
      });

      it('ignores modifiers', () => {
        const {result, errors} = parser._parseOwnerDefinition('', {
          name: '*',
          notify: true,
        });
        expect(result).toEqual(new WildcardOwner());
        expect(errors[0].message).toEqual(
          'Modifiers not supported on wildcard `*` owner'
        );
      });
    });
  });

  describe('parseRuleDefinition', () => {
    describe('when given something not a rule definition', () => {
      it('reports an error', () => {
        const {errors} = parser._parseRuleDefinition('', 'NOT A RULE DEF');
        expect(errors[0].message).toEqual(
          'Expected rule definition; got string'
        );
      });

      it('returns no result', () => {
        const {result} = parser._parseRuleDefinition('', 'NOT A RULE DEF');
        expect(result).toBeUndefined();
      });
    });

    describe('for a non-list owners property', () => {
      it('reports an error', () => {
        const {errors} = parser._parseRuleDefinition('', {owners: 1337});
        expect(errors[0].message).toEqual(
          'Expected "owners" to be a list; got number'
        );
      });

      it('returns no result', () => {
        const {result} = parser._parseRuleDefinition('', {owners: 1337});
        expect(result).toBeUndefined();
      });
    });

    describe('for a rule with no valid owners', () => {
      it('reports an error', () => {
        const {errors} = parser._parseRuleDefinition('', {
          owners: ['NOT AN OWNER DEF', 24],
        });
        const errorMessages = errors.map(({message}) => message);

        expect(errorMessages).toEqual([
          'Expected owner definition; got string',
          'Expected owner definition; got number',
          'No valid owners found; skipping rule',
        ]);
      });

      it('returns no result', () => {
        const {result} = parser._parseRuleDefinition('', {
          owners: ['NOT AN OWNER DEF', 24],
        });
        expect(result).toBeUndefined();
      });
    });

    it('creates an owners rule', () => {
      const {result} = parser._parseRuleDefinition('', {
        owners: [{name: 'rcebulko'}],
      });
      expect(result).toEqual(new OwnersRule('', [new UserOwner('rcebulko')]));
    });

    describe('when a pattern is specified', () => {
      describe('for a non-string pattern', () => {
        it('reports an error', () => {
          const {errors} = parser._parseRuleDefinition('', {
            pattern: {},
            owners: [{name: 'rcebulko'}],
          });
          expect(errors[0].message).toEqual(
            'Expected "pattern" to be a string; got object'
          );
        });

        it('returns no result', () => {
          const {result} = parser._parseRuleDefinition('', {
            pattern: {},
            owners: [{name: 'rcebulko'}],
          });
          expect(result).toBeUndefined();
        });
      });

      describe('for a directory glob pattern', () => {
        it('reports an error', () => {
          const {errors} = parser._parseRuleDefinition('', {
            pattern: 'foo-*/*.js',
            owners: [{name: 'rcebulko'}],
          });
          expect(errors[0].message).toContain(
            "directory patterns other than '**/' not supported"
          );
        });

        it('returns no result', () => {
          const {result} = parser._parseRuleDefinition('', {
            pattern: 'foo-*/*.js',
            owners: [{name: 'rcebulko'}],
          });
          expect(result).toBeUndefined();
        });
      });

      it('creates a same-directory rule', () => {
        const {result} = parser._parseRuleDefinition('', {
          pattern: '*.js',
          owners: [{name: 'rcebulko'}],
        });
        expect(result).toEqual(
          new SameDirPatternOwnersRule('', [new UserOwner('rcebulko')], '*.js')
        );
      });

      it('creates a recursive rule for a pattern starting with **/', () => {
        const {result} = parser._parseRuleDefinition('', {
          pattern: '**/*.js',
          owners: [{name: 'rcebulko'}],
        });
        expect(result).toEqual(
          new PatternOwnersRule('', [new UserOwner('rcebulko')], '*.js')
        );
      });
    });
  });

  describe('parseOwnersFileDefinition', () => {
    it('handles and reports JSON files without a `rules` property', () => {
      const {result, errors} = parser.parseOwnersFileDefinition('OWNERS', {});

      expect(result).toEqual([]);
      expect(errors[0].message).toEqual(
        'Failed to parse file; top-level "rules" key must contain a list'
      );
    });

    describe('for valid owners files', () => {
      // These tests directly parse the example owners file to ensure it always
      // stays in sync and valid.
      const exampleJson = fs.readFileSync(EXAMPLE_FILE_PATH);
      const fileDef = JSON5.parse(exampleJson);
      let errors;
      const rules = {};

      beforeEach(() => {
        const fileParse = parser.parseOwnersFileDefinition('OWNERS', fileDef);

        errors = fileParse.errors;
        Object.assign(rules, {
          reviewerSet: fileParse.result[0],
          basic: fileParse.result[1],
          filename: fileParse.result[2],
          pattern: fileParse.result[3],
          recursive: fileParse.result[4],
          braces: fileParse.result[5],
        });
      });

      it('parses the reviewer team', () => {
        const rule = rules.reviewerSet;
        expect(rule.owners.map(owner => owner.name)).toEqual([
          'ampproject/reviewers-amphtml',
        ]);
      });

      it('parses basic owner rules', () => {
        const rule = rules.basic;
        expect(rule.matchesFile('main.js')).toBe(true);
        expect(rule.matchesFile('foo/script.js')).toBe(true);
        expect(rule.matchesFile('bar/style.css')).toBe(true);
      });

      describe('owner definitions', () => {
        const owners = {};

        beforeEach(() => {
          Object.assign(owners, {
            user: rules.basic.owners[0],
            atSign: rules.basic.owners[1],
            team: rules.basic.owners[2],
            noReview: rules.basic.owners[3],
            notify: rules.basic.owners[4],
            doubleModifier: rules.basic.owners[5],
          });
        });

        it('parses user owners', () => {
          expect(owners.user.name).toEqual('someuser');
          expect(owners.atSign.name).toEqual('dontdothis');
        });

        it('parses team owners', () => {
          expect(owners.team.name).toEqual('ampproject/wg-cool-team');
        });

        it('parses owner modifiers', () => {
          expect(owners.user.modifier).toEqual(OWNER_MODIFIER.NONE);
          expect(owners.noReview.modifier).toEqual(OWNER_MODIFIER.SILENT);
          expect(owners.notify.modifier).toEqual(OWNER_MODIFIER.NOTIFY);
          expect(owners.doubleModifier.modifier).toEqual(OWNER_MODIFIER.NONE);
        });
      });

      it('parses filename rules', () => {
        const rule = rules.filename;
        expect(rule.matchesFile('package.json')).toBe(true);
        expect(rule.matchesFile('package-lock.json')).toBe(false);
        expect(rule.owners[0].name).toEqual('packager');
      });

      it('parses pattern rules', () => {
        const rule = rules.pattern;
        expect(rule.matchesFile('script.js')).toBe(true);
        expect(rule.matchesFile('main.js')).toBe(true);
        expect(rule.matchesFile('style.css')).toBe(false);
        expect(rule.owners[0].name).toEqual('scripter');
      });

      it('parses recursive pattern rules', () => {
        const rule = rules.recursive;
        expect(rule.matchesFile('validate.protoascii')).toBe(true);
        expect(rule.matchesFile('foo/cache.protoascii')).toBe(true);
        expect(rule.matchesFile('style.css')).toBe(false);
        expect(rule.owners[0].name).toEqual('ampproject/wg-caching');
      });

      it('reports an error for directory glob patterns', () => {
        const errorMessages = errors.map(({message}) => message);
        expect(errorMessages).toContain(
          "Failed to parse rule for pattern 'foo*/*.js'; " +
            "directory patterns other than '**/' not supported"
        );
      });

      it('parses brace-set rules', () => {
        const rule = rules.braces;
        expect(rule.matchesFile('main.css')).toBe(true);
        expect(rule.matchesFile('main.js')).toBe(true);
        expect(rule.matchesFile('main.html')).toBe(false);
        expect(rule.owners[0].name).toEqual('frontend');
      });
    });

    describe('reviewer team', () => {
      describe('in the repository root OWNERS file', () => {
        it('records the reviewer set from "reviewerTeam', () => {
          const fileDef = {
            reviewerTeam: 'ampproject/reviewers-amphtml',
            rules: [],
          };
          const {result} = parser.parseOwnersFileDefinition('OWNERS', fileDef);

          expect(result[0]).toEqual(
            new ReviewerSetRule('OWNERS', [new TeamOwner(reviewerTeam)])
          );
        });
      });

      describe('specified outside the repository root OWNERS file', () => {
        const fileDef = {
          reviewerTeam: 'ampproject/reviewers-amphtml',
          rules: [],
        };

        it('reports an error', () => {
          const {errors} = parser.parseOwnersFileDefinition(
            'src/OWNERS',
            fileDef
          );
          expect(errors[0].message).toEqual(
            'A reviewer team rule may only be specified at the repository root'
          );
        });

        it('does not produce a reviewer set rule', () => {
          const {result} = parser.parseOwnersFileDefinition(
            'src/OWNERS',
            fileDef
          );
          expect(result.length).toEqual(0);
        });
      });

      describe('for a non-string "reviewerTeam" property', () => {
        const fileDef = {
          reviewerTeam: {name: 'ampproject/reviewers-amphtml'},
          rules: [],
        };

        it('reports an error', () => {
          const {errors} = parser.parseOwnersFileDefinition('OWNERS', fileDef);
          expect(errors[0].message).toEqual(
            'Expected "reviewerTeam" to be a string; got object'
          );
        });

        it('does not produce a reviewer set rule', () => {
          const {result} = parser.parseOwnersFileDefinition('OWNERS', fileDef);
          expect(result.length).toEqual(0);
        });
      });

      describe('for an unknown team name', () => {
        const fileDef = {
          reviewerTeam: 'ampproject/unknown-team',
          rules: [],
        };

        it('reports an error', () => {
          const {errors} = parser.parseOwnersFileDefinition('OWNERS', fileDef);
          expect(errors[0].message).toEqual(
            "Unrecognized team: 'ampproject/unknown-team'"
          );
        });

        it('does not produce a reviewer set rule', () => {
          const {result} = parser.parseOwnersFileDefinition('OWNERS', fileDef);
          expect(result.length).toEqual(0);
        });
      });
    });
  });

  describe('parseOwnersFile', () => {
    it('reads the file from the local repository', async done => {
      sandbox.stub(repo, 'readFile').returns('{rules: []}');
      await parser.parseOwnersFile('foo/OWNERS');

      sandbox.assert.calledWith(repo.readFile, 'foo/OWNERS');
      done();
    });

    it('assigns the OWNERS directory path', async () => {
      expect.assertions(1);
      sandbox
        .stub(repo, 'readFile')
        .returns('{rules: [{owners: [{name: "rcebulko"}]}]}');
      const fileParse = await parser.parseOwnersFile('foo/OWNERS');
      const rules = fileParse.result;

      expect(rules[0].dirPath).toEqual('foo');
    });

    it('handles and reports JSON syntax errors', async () => {
      expect.assertions(2);
      sandbox.stub(repo, 'readFile').returns('hello!');
      const {result, errors} = await parser.parseOwnersFile('OWNERS');

      expect(result).toEqual([]);
      expect(errors[0].message).toContain('SyntaxError:');
    });

    it('parses the owners file definition', async done => {
      sandbox.stub(repo, 'readFile').returns('{rules: []}');
      sandbox.stub(parser, 'parseOwnersFileDefinition').callThrough();
      await parser.parseOwnersFile('foo/OWNERS');

      sandbox.assert.calledWith(
        parser.parseOwnersFileDefinition,
        'foo/OWNERS',
        {rules: []}
      );
      done();
    });
  });

  describe('parseAllOwnersRules', () => {
    it('reads all owners files in the repo', async () => {
      expect.assertions(4);
      sandbox.stub(repo, 'findOwnersFiles').returns(['OWNERS', 'foo/OWNERS']);
      const readFileStub = sandbox.stub(repo, 'readFile');
      readFileStub.onCall(0).returns(
        JSON.stringify({
          rules: [
            {
              owners: [{name: 'user1'}, {name: 'user2'}],
            },
          ],
        })
      );
      readFileStub.onCall(1).returns(
        JSON.stringify({
          rules: [
            {
              owners: [{name: 'user3'}, {name: 'user4'}],
            },
          ],
        })
      );
      const ruleParse = await parser.parseAllOwnersRules();
      const rules = ruleParse.result;

      expect(rules[0].dirPath).toEqual('.');
      expect(rules[1].dirPath).toEqual('foo');
      expect(rules[0].owners).toEqual([
        new UserOwner('user1'),
        new UserOwner('user2'),
      ]);
      expect(rules[1].owners).toEqual([
        new UserOwner('user3'),
        new UserOwner('user4'),
      ]);
    });

    it('does not include invalid rules', async () => {
      expect.assertions(1);
      sandbox.stub(repo, 'findOwnersFiles').returns(['OWNERS']);
      sandbox.stub(repo, 'readFile').returns('dict:\n  key: value');
      const ruleParse = await parser.parseAllOwnersRules();
      const rules = ruleParse.result;

      expect(rules).toEqual([]);
    });

    it('collects errors from all parsed files', async () => {
      expect.assertions(1);
      sandbox.stub(repo, 'findOwnersFiles').returns(['OWNERS', 'foo/OWNERS']);
      sandbox.stub(repo, 'readFile').returns('dict:\n  key: value');
      const {errors} = await parser.parseAllOwnersRules();

      expect(errors.length).toEqual(2);
    });
  });

  describe('parseOwnersTree', () => {
    const rootRule = new OwnersRule('OWNERS', ['user1', 'user2']);
    const childRule = new OwnersRule('foo/OWNERS', ['user3', 'user4']);

    it('adds each rule to the tree', async () => {
      expect.assertions(2);
      sandbox
        .stub(parser, 'parseAllOwnersRules')
        .returns({result: [rootRule, childRule], errors: []});
      const treeParse = await parser.parseOwnersTree();
      const tree = treeParse.result;

      expect(tree.rules).toContain(rootRule);
      expect(tree.get('foo').rules).toContain(childRule);
    });

    it('returns parser errors', async () => {
      expect.assertions(1);
      sandbox
        .stub(parser, 'parseAllOwnersRules')
        .returns({result: [], errors: [new Error('Oops!')]});
      const {errors} = await parser.parseOwnersTree();

      expect(errors[0].message).toEqual('Oops!');
    });
  });
});
