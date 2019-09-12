const sinon = require('sinon');
const {LocalRepository} = require('../src/local_repo');
const {OwnersParser, OwnersParserError} = require('../src/parser');
const {
  OwnersRule,
  PatternOwnersRule,
  SameDirPatternOwnersRule,
} = require('../src/rules');

describe('owners parser error', () => {
  describe('toString', () => {
    const error = new OwnersParserError('foo/OWNERS.yaml', 'Oops!');

    it('displays the file containing the error', () => {
      expect(error.toString()).toContain('[foo/OWNERS.yaml]');
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

  beforeEach(() => {
    repo = new LocalRepository('path/to/repo');
    parser = new OwnersParser(repo);
    sandbox.stub(repo, 'getAbsolutePath').callsFake(relativePath => {
      return `path/to/repo/${relativePath}`;
    });
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe('parseOwnersFile', () => {
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
      const fileParse = parser.parseOwnersFile('');
      const rules = fileParse.result;

      expect(rules[0].owners).toEqual(['user1', 'user2']);
    });

    it('parses a YAML list with blank lines and comments', () => {
      sandbox.stub(repo, 'readFile').returns('- user1\n# comment\n\n- user2\n');
      const fileParse = parser.parseOwnersFile('');
      const rules = fileParse.result;

      expect(rules[0].owners).toEqual(['user1', 'user2']);
    });

    describe('team rule declarations', () => {
      it('returns no rule', () => {
        sandbox.stub(repo, 'readFile').returns('- ampproject/team\n');
        const fileParse = parser.parseOwnersFile('');
        const rules = fileParse.result;

        expect(rules).toEqual([]);
      });

      it('records an error', () => {
        sandbox.stub(repo, 'readFile').returns('- ampproject/team\n');
        const {errors} = parser.parseOwnersFile('');

        expect(errors[0].message).toEqual(
          "Failed to parse owner 'ampproject/team'; team ownership not yet supported"
        );
      });
    });

    describe('owner with a leading @', () => {
      let fileParse;

      beforeEach(() => {
        sandbox.stub(repo, 'readFile').returns('- @owner');
        fileParse = parser.parseOwnersFile('');
      });

      it('parses ignoring the @ sign', () => {
        const [rule] = fileParse.result;
        expect(rule.owners).toEqual(['owner']);
      });

      it('records an error', () => {
        const [error] = fileParse.errors;
        expect(error.message).toEqual("Ignoring unnecessary '@' in '@owner'");
      });
    });

    describe('rule dictionary', () => {
      it('parses a single owner into a pattern rule', () => {
        sandbox.stub(repo, 'readFile').returns('- *.js: scripty\n');
        const fileParse = parser.parseOwnersFile('');
        const rules = fileParse.result;

        expect(rules[0]).toBeInstanceOf(SameDirPatternOwnersRule);
        expect(rules[0].pattern).toEqual('*.js');
        expect(rules[0].owners).toEqual(['scripty']);
      });

      it('parses a list of owners into a pattern rule', () => {
        sandbox
          .stub(repo, 'readFile')
          .returns('- *.js:\n  - scripty\n  - coder\n');
        const fileParse = parser.parseOwnersFile('');
        const rules = fileParse.result;

        expect(rules[0]).toBeInstanceOf(SameDirPatternOwnersRule);
        expect(rules[0].pattern).toEqual('*.js');
        expect(rules[0].owners).toEqual(['scripty', 'coder']);
      });

      it('reports errors for non-string owners', () => {
        sandbox
          .stub(repo, 'readFile')
          .returns('- *.js:\n  - nestedDict: "value"\n');
        const {errors} = parser.parseOwnersFile('');

        expect(errors[0].message).toContain(
          "Failed to parse owner of type object for pattern rule '*.js'"
        );
      });

      it('starting with **/ parses into a recursive pattern rule', () => {
        sandbox.stub(repo, 'readFile').returns('- **/*.js: scripty\n');
        const fileParse = parser.parseOwnersFile('');
        const rules = fileParse.result;

        expect(rules[0]).toBeInstanceOf(PatternOwnersRule);
        expect(rules[0].pattern).toEqual('*.js');
        expect(rules[0].owners).toEqual(['scripty']);
      });

      it('parses no rule if no valid owners are listed', () => {
        sandbox.stub(repo, 'readFile').returns('- *.js: bad/team_owner\n');
        const fileParse = parser.parseOwnersFile('');
        const rules = fileParse.result;

        expect(rules.length).toEqual(0);
      });

      it("reports an error for patterns containing illegal '/'", () => {
        sandbox.stub(repo, 'readFile').returns('- foo/*.js: scripty\n');
        const fileParse = parser.parseOwnersFile('');

        expect(fileParse.result.length).toEqual(0);
        expect(fileParse.errors[0].message).toEqual(
          "Failed to parse rule for pattern 'foo/*.js'; directory patterns other than '**/' not supported"
        );
      });

      it('parses comma-separate patterns as separate rules', () => {
        sandbox.stub(repo, 'readFile').returns('- *.js, *.css: frontend\n');
        const fileParse = parser.parseOwnersFile('');
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
        const fileParse = parser.parseOwnersFile('');
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
  });

  describe('parseAllOwnersRules', () => {
    it('reads all owners files in the repo', async () => {
      expect.assertions(4);
      sandbox
        .stub(repo, 'findOwnersFiles')
        .returns(['OWNERS.yaml', 'foo/OWNERS.yaml']);
      const readFileStub = sandbox.stub(repo, 'readFile');
      readFileStub.onCall(0).returns('- user1\n- user2\n');
      readFileStub.onCall(1).returns('- user3\n- user4\n');
      const ruleParse = await parser.parseAllOwnersRules();
      const rules = ruleParse.result;

      expect(rules[0].dirPath).toEqual('.');
      expect(rules[1].dirPath).toEqual('foo');
      expect(rules[0].owners).toEqual(['user1', 'user2']);
      expect(rules[1].owners).toEqual(['user3', 'user4']);
    });

    it('does not include invalid rules', async () => {
      expect.assertions(1);
      sandbox.stub(repo, 'findOwnersFiles').returns(['OWNERS.yaml']);
      sandbox.stub(repo, 'readFile').returns('dict:\n  key: value');
      const ruleParse = await parser.parseAllOwnersRules();
      const rules = ruleParse.result;

      expect(rules).toEqual([]);
    });

    it('collects errors from all parsed files', async () => {
      expect.assertions(1);
      sandbox
        .stub(repo, 'findOwnersFiles')
        .returns(['OWNERS.yaml', 'foo/OWNERS.yaml']);
      sandbox.stub(repo, 'readFile').returns('dict:\n  key: value');
      const {errors} = await parser.parseAllOwnersRules();

      expect(errors.length).toEqual(2);
    });
  });

  describe('parseOwnersTree', () => {
    const rootRule = new OwnersRule('OWNERS.yaml', ['user1', 'user2']);
    const childRule = new OwnersRule('foo/OWNERS.yaml', ['user3', 'user4']);

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
