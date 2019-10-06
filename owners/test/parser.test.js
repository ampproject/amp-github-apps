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
const {Team} = require('../src/github');
const {LocalRepository} = require('../src/local_repo');
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

  beforeEach(() => {
    myTeam = new Team(1337, 'ampproject', 'my_team');
    myTeam.members = ['team_member', 'other_member'];

    repo = new LocalRepository('path/to/repo');
    parser = new OwnersParser(repo, {
      'ampproject/my_team': myTeam,
      'ampproject/wg-cool-team': wgCool,
      'ampproject/wg-caching': wgCaching,
      'ampproject/wg-infra': wgInfra,
    });

    sandbox.stub(repo, 'getAbsolutePath').callsFake(relativePath => {
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
            'Cannot specify both "notify: true" and "requestReviews: false"'
          );
        });

        it('ignores the options', () => {
          const {result} = parser._parseOwnerDefinition('', {
            name: 'me',
            notify: true,
            requestReviews: false,
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
          basic: fileParse.result[0],
          filename: fileParse.result[1],
          pattern: fileParse.result[2],
          recursive: fileParse.result[3],
          braces: fileParse.result[4],
        });
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
  });

  describe('parseOwnersFile', () => {
    describe('YAML format', () => {
      it('reads the file from the local repository', () => {
        sandbox.stub(repo, 'readFile').returns('- owner');
        parser.parseOwnersFile('foo/OWNERS.yaml');

        sandbox.assert.calledWith(repo.readFile, 'foo/OWNERS.yaml');
      });

      it('assigns the OWNERS directory path', () => {
        sandbox.stub(repo, 'readFile').returns('- owner');
        const fileParse = parser.parseOwnersFile('foo/OWNERS.yaml');
        const rules = fileParse.result;

        expect(rules[0].dirPath).toEqual('foo');
      });

      it('parses a YAML list', () => {
        sandbox.stub(repo, 'readFile').returns('- user1\n- user2\n');
        const fileParse = parser.parseOwnersFile('OWNERS.yaml');
        const rules = fileParse.result;

        expect(rules[0].owners).toEqual([
          new UserOwner('user1'),
          new UserOwner('user2'),
        ]);
      });

      it('parses a YAML list with blank lines and comments', () => {
        sandbox
          .stub(repo, 'readFile')
          .returns('- user1\n# comment\n\n- user2\n');
        const fileParse = parser.parseOwnersFile('OWNERS.yaml');
        const rules = fileParse.result;

        expect(rules[0].owners).toEqual([
          new UserOwner('user1'),
          new UserOwner('user2'),
        ]);
      });

      it('parses a wildcard owner', () => {
        sandbox.stub(repo, 'readFile').returns('- "*"');
        const fileParse = parser.parseOwnersFile('OWNERS.yaml');
        const rules = fileParse.result;

        expect(rules[0].owners).toEqual([new WildcardOwner()]);
      });

      it('handles and reports YAML syntax errors', () => {
        sandbox.stub(repo, 'readFile').returns('- *');
        const {result, errors} = parser.parseOwnersFile('OWNERS.yaml');

        expect(result).toEqual([]);
        expect(errors[0].message).toContain('<ParseException>');
      });

      describe('team rule declarations', () => {
        it('returns a rule with all team members as owners', () => {
          sandbox.stub(repo, 'readFile').returns('- ampproject/my_team\n');
          const fileParse = parser.parseOwnersFile('OWNERS.yaml');
          const rules = fileParse.result;

          expect(rules[0].owners).toEqual([new TeamOwner(myTeam)]);
        });

        it('records an error for unknown teams', () => {
          sandbox.stub(repo, 'readFile').returns('- ampproject/other_team\n');
          const {errors} = parser.parseOwnersFile('OWNERS.yaml');

          expect(errors[0].message).toEqual(
            "Unrecognized team: 'ampproject/other_team'"
          );
        });
      });

      describe('owner with a leading @', () => {
        let fileParse;

        beforeEach(() => {
          sandbox.stub(repo, 'readFile').returns('- @owner');
          fileParse = parser.parseOwnersFile('OWNERS.yaml');
        });

        it('parses ignoring the @ sign', () => {
          const [rule] = fileParse.result;
          expect(rule.owners).toEqual([new UserOwner('owner')]);
        });

        it('records an error', () => {
          const [error] = fileParse.errors;
          expect(error.message).toEqual("Ignoring unnecessary '@' in '@owner'");
        });
      });

      describe('rule dictionary', () => {
        it('parses a single owner into a pattern rule', () => {
          sandbox.stub(repo, 'readFile').returns('- *.js: scripty\n');
          const fileParse = parser.parseOwnersFile('OWNERS.yaml');
          const rules = fileParse.result;

          expect(rules[0]).toBeInstanceOf(SameDirPatternOwnersRule);
          expect(rules[0].pattern).toEqual('*.js');
          expect(rules[0].owners).toEqual([new UserOwner('scripty')]);
        });

        it('parses a list of owners into a pattern rule', () => {
          sandbox
            .stub(repo, 'readFile')
            .returns('- *.js:\n  - scripty\n  - coder\n');
          const fileParse = parser.parseOwnersFile('OWNERS.yaml');
          const rules = fileParse.result;

          expect(rules[0]).toBeInstanceOf(SameDirPatternOwnersRule);
          expect(rules[0].pattern).toEqual('*.js');
          expect(rules[0].owners).toEqual([
            new UserOwner('scripty'),
            new UserOwner('coder'),
          ]);
        });

        it('reports errors for non-string owners', () => {
          sandbox
            .stub(repo, 'readFile')
            .returns('- *.js:\n  - nestedDict: "value"\n');
          const {errors} = parser.parseOwnersFile('OWNERS.yaml');

          expect(errors[0].message).toContain(
            "Failed to parse owner of type object for pattern rule '*.js'"
          );
        });

        it('starting with **/ parses into a recursive pattern rule', () => {
          sandbox.stub(repo, 'readFile').returns('- **/*.js: scripty\n');
          const fileParse = parser.parseOwnersFile('OWNERS.yaml');
          const rules = fileParse.result;

          expect(rules[0]).toBeInstanceOf(PatternOwnersRule);
          expect(rules[0].pattern).toEqual('*.js');
          expect(rules[0].owners).toEqual([new UserOwner('scripty')]);
        });

        it('parses no rule if no valid owners are listed', () => {
          sandbox.stub(repo, 'readFile').returns('- *.js: bad/team_owner\n');
          const fileParse = parser.parseOwnersFile('OWNERS.yaml');
          const rules = fileParse.result;

          expect(rules.length).toEqual(0);
        });

        it("reports an error for patterns containing illegal '/'", () => {
          sandbox.stub(repo, 'readFile').returns('- foo/*.js: scripty\n');
          const fileParse = parser.parseOwnersFile('OWNERS.yaml');

          expect(fileParse.result.length).toEqual(0);
          expect(fileParse.errors[0].message).toEqual(
            "Failed to parse rule for pattern 'foo/*.js'; directory patterns other than '**/' not supported"
          );
        });

        it('parses brace-set glob patterns', () => {
          sandbox.stub(repo, 'readFile').returns('- *.{js,css}: frontend\n');
          const fileParse = parser.parseOwnersFile('OWNERS.yaml');
          const rules = fileParse.result;

          expect(rules[0].pattern).toEqual('*.{js,css}');
        });

        it('parses comma-separate patterns as separate rules', () => {
          sandbox.stub(repo, 'readFile').returns('- *.js, *.css: frontend\n');
          const fileParse = parser.parseOwnersFile('OWNERS.yaml');
          const rules = fileParse.result;

          expect(rules[0].pattern).toEqual('*.js');
          expect(rules[1].pattern).toEqual('*.css');
        });
      });

      describe('files containing top-level dictionaries', () => {
        beforeEach(() => {
          sandbox
            .stub(repo, 'readFile')
            .returns('dict:\n  key: "value"\n  key2: "value2"\n');
        });

        it('returns no rules', () => {
          const fileParse = parser.parseOwnersFile('OWNERS.yaml');
          const rules = fileParse.result;

          expect(rules).toEqual([]);
        });

        it('returns a parser error', () => {
          const {errors} = parser.parseOwnersFile('foo/OWNERS.yaml');

          expect(errors[0].message).toEqual(
            'Failed to parse file; must be a YAML list'
          );
        });
      });

      describe('owner modifiers', () => {
        describe('user owner', () => {
          it('parses an always-notify `#` modifier', () => {
            sandbox.stub(repo, 'readFile').returns('- "#auser"');
            const fileParse = parser.parseOwnersFile('OWNERS.yaml');
            const rules = fileParse.result;

            expect(rules[0].owners).toContainEqual(
              new UserOwner('auser', OWNER_MODIFIER.NOTIFY)
            );
          });

          it('parses a never-notify `?` modifier', () => {
            sandbox.stub(repo, 'readFile').returns('- "?auser"');
            const fileParse = parser.parseOwnersFile('OWNERS.yaml');
            const rules = fileParse.result;

            expect(rules[0].owners).toContainEqual(
              new UserOwner('auser', OWNER_MODIFIER.SILENT)
            );
          });

          it('parses a require-review `!` modifier', () => {
            sandbox.stub(repo, 'readFile').returns('- "!auser"');
            const fileParse = parser.parseOwnersFile('OWNERS.yaml');
            const rules = fileParse.result;

            expect(rules[0].owners).toContainEqual(
              new UserOwner('auser', OWNER_MODIFIER.REQUIRE)
            );
          });
        });

        describe('team owner', () => {
          it('parses an always-notify `#` team modifier', () => {
            sandbox.stub(repo, 'readFile').returns('- "#ampproject/my_team"');
            const fileParse = parser.parseOwnersFile('OWNERS.yaml');
            const teamOwner = fileParse.result[0].owners[0];

            expect(teamOwner.name).toEqual('ampproject/my_team');
            expect(teamOwner.modifier).toEqual(OWNER_MODIFIER.NOTIFY);
          });

          it('parses a never-notify `?` team modifier', () => {
            sandbox.stub(repo, 'readFile').returns('- "?ampproject/my_team"');
            const fileParse = parser.parseOwnersFile('OWNERS.yaml');
            const teamOwner = fileParse.result[0].owners[0];

            expect(teamOwner.name).toEqual('ampproject/my_team');
            expect(teamOwner.modifier).toEqual(OWNER_MODIFIER.SILENT);
          });

          it('parses a require-review `!` team modifier', () => {
            sandbox.stub(repo, 'readFile').returns('- "!ampproject/my_team"');
            const fileParse = parser.parseOwnersFile('OWNERS.yaml');
            const teamOwner = fileParse.result[0].owners[0];

            expect(teamOwner.name).toEqual('ampproject/my_team');
            expect(teamOwner.modifier).toEqual(OWNER_MODIFIER.REQUIRE);
          });
        });

        describe('wildcard owner', () => {
          it('reports an error for an always-notify `#` modifier', () => {
            sandbox.stub(repo, 'readFile').returns('- "#*"');
            const {result, errors} = parser.parseOwnersFile('OWNERS.yaml');

            expect(result[0].owners[0]).toEqual(
              new WildcardOwner(OWNER_MODIFIER.NONE)
            );
            expect(errors[0].message).toEqual(
              'Modifiers not supported on wildcard `*` owner'
            );
          });

          it('reports an error for a never-notify `?` modifier', () => {
            sandbox.stub(repo, 'readFile').returns('- "?*"');
            const {result, errors} = parser.parseOwnersFile('OWNERS.yaml');

            expect(result[0].owners[0]).toEqual(
              new WildcardOwner(OWNER_MODIFIER.NONE)
            );
            expect(errors[0].message).toEqual(
              'Modifiers not supported on wildcard `*` owner'
            );
          });

          it('reports an error for a require-review `!` modifier', () => {
            sandbox.stub(repo, 'readFile').returns('- "!*"');
            const {result, errors} = parser.parseOwnersFile('OWNERS.yaml');

            expect(result[0].owners[0]).toEqual(
              new WildcardOwner(OWNER_MODIFIER.NONE)
            );
            expect(errors[0].message).toEqual(
              'Modifiers not supported on wildcard `*` owner'
            );
          });
        });
      });
    });

    describe('JSON5 format', () => {
      it('reads the file from the local repository', () => {
        sandbox.stub(repo, 'readFile').returns('{rules: []}');
        parser.parseOwnersFile('foo/OWNERS');

        sandbox.assert.calledWith(repo.readFile, 'foo/OWNERS');
      });

      it('assigns the OWNERS directory path', () => {
        sandbox
          .stub(repo, 'readFile')
          .returns('{rules: [{owners: [{name: "rcebulko"}]}]}');
        const fileParse = parser.parseOwnersFile('foo/OWNERS');
        const rules = fileParse.result;

        expect(rules[0].dirPath).toEqual('foo');
      });

      it('handles and reports JSON syntax errors', () => {
        sandbox.stub(repo, 'readFile').returns('hello!');
        const {result, errors} = parser.parseOwnersFile('OWNERS');

        expect(result).toEqual([]);
        expect(errors[0].message).toContain('SyntaxError:');
      });

      it('parses the owners file definition', () => {
        sandbox.stub(repo, 'readFile').returns('{rules: []}');
        sandbox.stub(parser, 'parseOwnersFileDefinition').callThrough();
        parser.parseOwnersFile('foo/OWNERS');

        sandbox.assert.calledWith(
          parser.parseOwnersFileDefinition,
          'foo/OWNERS',
          {rules: []}
        );
      });
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
