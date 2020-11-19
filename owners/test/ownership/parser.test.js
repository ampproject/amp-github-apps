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

const fs = require('fs');
const JSON5 = require('json5');
const LocalRepository = require('../../src/repo/local_repo');
const path = require('path');
const sinon = require('sinon');
const {
  OwnersRule,
  PatternOwnersRule,
  SameDirPatternOwnersRule,
  ReviewerSetRule,
} = require('../../src/ownership/rules');
const {
  UserOwner,
  TeamOwner,
  WildcardOwner,
  OWNER_MODIFIER,
} = require('../../src/ownership/owner');
const {OwnersParser, OwnersParserError} = require('../../src/ownership/parser');
const {Team} = require('../../src/api/github');

const EXAMPLE_FILE_PATH = path.resolve(__dirname, '../../OWNERS.example');

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
  const wgCool = new Team('ampproject', 'wg-cool-team');
  const wgCaching = new Team('ampproject', 'wg-caching');
  const wgInfra = new Team('ampproject', 'wg-infra');
  const reviewerTeam = new Team('ampproject', 'reviewers-amphtml');

  function parseRuleDefinition(ruleDef) {
    const {result, errors} = parser.parseOwnersFileDefinition('OWNERS', {
      rules: [ruleDef],
    });
    return {rule: result && result[0], errors};
  }

  function parseOwnerDefinition(ownerDef) {
    const {rule, errors} = parseRuleDefinition({owners: [ownerDef]});
    return {owner: rule && rule.owners[0], errors};
  }

  beforeEach(() => {
    myTeam = new Team('ampproject', 'my_team');
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
        const {errors} = parseOwnerDefinition('HELLO!');
        expect(errors[0].message).toEqual(
          '`OWNERS.rules[0].owners[0]` should be object'
        );
      });

      it('returns no result', () => {
        const {owner} = parseOwnerDefinition('HELLO!');
        expect(owner).toBeUndefined();
      });
    });

    describe('when an unexpected key is present', () => {
      it('reports an error', () => {
        const {errors} = parseOwnerDefinition({
          name: 'blah',
          pattern: 'something.js', // This should be in the rule, not the owner
        });
        expect(errors[0].message).toEqual(
          '`OWNERS.rules[0].owners[0]` should NOT have additional properties'
        );
      });

      it('returns no result', () => {
        const {owner} = parseOwnerDefinition({
          name: 'blah',
          pattern: 'something.js', // This should be in the rule, not the owner
        });
        expect(owner).toBeUndefined();
      });
    });

    describe('for a non-string name', () => {
      it('reports an error', () => {
        const {errors} = parseOwnerDefinition({name: {}});
        expect(errors[0].message).toEqual(
          '`OWNERS.rules[0].owners[0].name` should be string'
        );
      });

      it('returns no result', () => {
        const {owner} = parseOwnerDefinition({name: {}});
        expect(owner).toBeUndefined();
      });
    });

    describe('for a name with a leading "@"', () => {
      it('reports an error', () => {
        const {errors} = parseOwnerDefinition({name: '@myname'});
        expect(errors[0].message).toContain(
          '`OWNERS.rules[0].owners[0].name` should match pattern'
        );
      });

      it('returns no the "@"', () => {
        const {owner} = parseOwnerDefinition({name: '@myname'});
        expect(owner).toBeUndefined();
      });
    });

    describe('modifiers', () => {
      describe('when multiple options are specified', () => {
        it('reports an error', () => {
          const {errors} = parseOwnerDefinition({
            name: 'myname',
            notify: true,
            requestReviews: false,
          });
          expect(errors[0].message).toContain(
            '`OWNERS.rules[0].owners[0]` should NOT have more than 2 properties'
          );
        });

        it('returns no result', () => {
          const {owner} = parseOwnerDefinition({
            name: 'myname',
            notify: true,
            required: true,
          });
          expect(owner).toBeUndefined();
        });
      });

      it('defaults to no modifier', () => {
        const {owner} = parseOwnerDefinition({name: 'myname'});
        expect(owner.modifier).toEqual(OWNER_MODIFIER.NONE);
      });

      it('selects always-notify modifier when "notify" is true', () => {
        const {owner} = parseOwnerDefinition({
          name: 'myname',
          notify: true,
        });
        expect(owner.modifier).toEqual(OWNER_MODIFIER.NOTIFY);
      });

      it('selects never-notify modifier when "requestReviews" is false', () => {
        const {owner} = parseOwnerDefinition({
          name: 'myname',
          requestReviews: false,
        });
        expect(owner.modifier).toEqual(OWNER_MODIFIER.SILENT);
      });

      it('selects require-review modifier when "required" is true', () => {
        const {owner} = parseOwnerDefinition({
          name: 'myname',
          required: true,
        });
        expect(owner.modifier).toEqual(OWNER_MODIFIER.REQUIRE);
      });
    });

    describe('team owner declarations', () => {
      it('returns a team owner', () => {
        const {owner} = parseOwnerDefinition({
          name: 'ampproject/my_team',
        });
        expect(owner).toEqual(new TeamOwner(myTeam));
      });

      describe('when the team is unknown', () => {
        it('reports an error', () => {
          const {errors} = parseOwnerDefinition({
            name: 'ampproject/other-team',
          });
          expect(errors[0].message).toContain(
            "Unrecognized team: 'ampproject/other-team'"
          );
        });

        it('returns no result', () => {
          const {owner} = parseOwnerDefinition({
            name: 'ampproject/other-team',
          });
          expect(owner).toBeUndefined();
        });
      });
    });

    describe('wildcard owner declarations', () => {
      it('parses a wildcard owner', () => {
        const {owner} = parseOwnerDefinition({name: '*'});
        expect(owner).toEqual(new WildcardOwner());
      });

      it('ignores modifiers', () => {
        const {owner, errors} = parseOwnerDefinition({
          name: '*',
          notify: true,
        });
        expect(owner).toEqual(new WildcardOwner());
        expect(errors[0].message).toEqual(
          'Modifiers not supported on wildcard `*` owner'
        );
      });
    });
  });

  describe('parseRuleDefinition', () => {
    describe('when given something not a rule definition', () => {
      it('reports an error', () => {
        const {errors} = parseRuleDefinition('NOT A RULE DEF');
        expect(errors[0].message).toEqual('`OWNERS.rules[0]` should be object');
      });

      it('returns no result', () => {
        const {rule} = parseRuleDefinition('NOT A RULE DEF');
        expect(rule).toBeUndefined();
      });
    });

    describe('when an unexpected key is present', () => {
      it('reports an error', () => {
        const {errors} = parseRuleDefinition({
          owners: [{name: 'blah'}],
          notify: true, // This should be in the owner, not the rule
        });
        expect(errors[0].message).toEqual(
          '`OWNERS.rules[0]` should NOT have additional properties'
        );
      });

      it('returns no result', () => {
        const {rule} = parseRuleDefinition({
          owners: [{name: 'blah'}],
          notify: true, // This should be in the owner, not the rule
        });
        expect(rule).toBeUndefined();
      });
    });

    describe('for a non-list owners property', () => {
      it('reports an error', () => {
        const {errors} = parseRuleDefinition({owners: 1337});
        expect(errors[0].message).toEqual(
          '`OWNERS.rules[0].owners` should be array'
        );
      });

      it('returns no result', () => {
        const {rule} = parseRuleDefinition({owners: 1337});
        expect(rule).toBeUndefined();
      });
    });

    describe('for a rule with no valid owners', () => {
      it('reports an error', () => {
        const {errors} = parseRuleDefinition({
          owners: ['NOT AN OWNER DEF', 24],
        });
        const errorMessages = errors.map(({message}) => message);

        expect(errorMessages).toEqual([
          '`OWNERS.rules[0].owners[0]` should be object',
          '`OWNERS.rules[0].owners[1]` should be object',
        ]);
      });

      it('returns no result', () => {
        const {rule} = parseRuleDefinition({
          owners: ['NOT AN OWNER DEF', 24],
        });
        expect(rule).toBeUndefined();
      });
    });

    it('creates an owners rule', () => {
      const {rule} = parseRuleDefinition({
        owners: [{name: 'coder'}],
      });
      expect(rule).toEqual(new OwnersRule('OWNERS', [new UserOwner('coder')]));
    });

    describe('when a pattern is specified', () => {
      describe('for a non-string pattern', () => {
        it('reports an error', () => {
          const {errors} = parseRuleDefinition({
            pattern: {},
            owners: [{name: 'coder'}],
          });
          expect(errors[0].message).toEqual(
            '`OWNERS.rules[0].pattern` should be string'
          );
        });

        it('returns no result', () => {
          const {rule} = parseRuleDefinition({
            pattern: {},
            owners: [{name: 'coder'}],
          });
          expect(rule).toBeUndefined();
        });
      });

      describe('for a singleton pattern in braces', () => {
        it('reports an error', () => {
          const {errors} = parseRuleDefinition({
            pattern: '{amp-story-*}.js',
            owners: [{name: 'coder'}],
          });
          expect(errors[0].message).toContain(
            'braces only contain one pattern'
          );
        });

        it('returns no result', () => {
          const {rule} = parseRuleDefinition({
            pattern: '{amp-story-*}.js',
            owners: [{name: 'coder'}],
          });
          expect(rule).toBeUndefined();
        });
      });

      describe('for a directory glob pattern', () => {
        it('reports an error', () => {
          const {errors} = parseRuleDefinition({
            pattern: 'foo-*/*.js',
            owners: [{name: 'coder'}],
          });
          expect(errors[0].message).toContain(
            "directory patterns other than '**/' not supported"
          );
        });

        it('returns no result', () => {
          const {rule} = parseRuleDefinition({
            pattern: 'foo-*/*.js',
            owners: [{name: 'coder'}],
          });
          expect(rule).toBeUndefined();
        });
      });

      it('creates a same-directory rule', () => {
        const {rule} = parseRuleDefinition({
          pattern: '*.js',
          owners: [{name: 'coder'}],
        });
        expect(rule).toEqual(
          new SameDirPatternOwnersRule(
            'OWNERS',
            [new UserOwner('coder')],
            '*.js'
          )
        );
      });

      it('creates a recursive rule for a pattern starting with **/', () => {
        const {rule} = parseRuleDefinition({
          pattern: '**/*.js',
          owners: [{name: 'coder'}],
        });
        expect(rule).toEqual(
          new PatternOwnersRule('OWNERS', [new UserOwner('coder')], '*.js')
        );
      });
    });
  });

  describe('parseOwnersFileDefinition', () => {
    it('handles and reports JSON files without a `rules` property', () => {
      const {result, errors} = parser.parseOwnersFileDefinition('OWNERS', {});

      expect(result).toEqual([]);
      expect(errors[0].message).toEqual(
        "`OWNERS` should have required property 'rules'"
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
            team: rules.basic.owners[1],
            noReview: rules.basic.owners[2],
            notify: rules.basic.owners[3],
          });
        });

        it('parses user owners', () => {
          expect(owners.user.name).toEqual('someuser');
        });

        it('parses team owners', () => {
          expect(owners.team.name).toEqual('ampproject/wg-cool-team');
        });

        it('parses owner modifiers', () => {
          expect(owners.user.modifier).toEqual(OWNER_MODIFIER.NONE);
          expect(owners.noReview.modifier).toEqual(OWNER_MODIFIER.SILENT);
          expect(owners.notify.modifier).toEqual(OWNER_MODIFIER.NOTIFY);
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
      const rules = [{owners: [{name: 'someone'}]}];

      describe('in the repository root OWNERS file', () => {
        it('records the reviewer set from "reviewerTeam', () => {
          const fileDef = {
            rules,
            reviewerTeam: 'ampproject/reviewers-amphtml',
          };
          const {result} = parser.parseOwnersFileDefinition('OWNERS', fileDef);

          expect(result[0]).toEqual(
            new ReviewerSetRule('OWNERS', [new TeamOwner(reviewerTeam)])
          );
        });
      });

      describe('specified outside the repository root OWNERS file', () => {
        const fileDef = {
          rules,
          reviewerTeam: 'ampproject/reviewers-amphtml',
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
          expect(result.length).toEqual(1);
        });
      });

      describe('for a non-string "reviewerTeam" property', () => {
        const fileDef = {
          rules,
          reviewerTeam: {name: 'ampproject/reviewers-amphtml'},
        };

        it('reports an error', () => {
          const {errors} = parser.parseOwnersFileDefinition('OWNERS', fileDef);
          expect(errors[0].message).toEqual(
            '`OWNERS.reviewerTeam` should be string'
          );
        });

        it('does not produce a result', () => {
          const {result} = parser.parseOwnersFileDefinition('OWNERS', fileDef);
          expect(result).toEqual([]);
        });
      });

      describe('for an unknown team namyname', () => {
        const fileDef = {
          rules,
          reviewerTeam: 'ampproject/unknown-team',
        };

        it('reports an error', () => {
          const {errors} = parser.parseOwnersFileDefinition('OWNERS', fileDef);
          expect(errors[0].message).toEqual(
            "Unrecognized team: 'ampproject/unknown-team'"
          );
        });

        it('does not produce a reviewer set rule', () => {
          const {result} = parser.parseOwnersFileDefinition('OWNERS', fileDef);
          expect(result.length).toEqual(1);
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
        .returns('{rules: [{owners: [{name: "coder"}]}]}');
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
