const sinon = require('sinon');
const {LocalRepository} = require('../src/local_repo');
const {OwnersParser} = require('../src/parser');
const {OwnersRule} = require('../src/rules');

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
      const {rules} = parser.parseOwnersFile('foo/OWNERS.yaml');

      expect(rules[0].dirPath).toEqual('foo');
    });

    it('parses a YAML list', () => {
      sandbox.stub(repo, 'readFile').returns('- user1\n- user2\n');
      const {rules} = parser.parseOwnersFile('');

      expect(rules[0].owners).toEqual(['user1', 'user2']);
    });

    it('parses a YAML list with blank lines and comments', () => {
      sandbox.stub(repo, 'readFile').returns('- user1\n# comment\n\n- user2\n');
      const {rules} = parser.parseOwnersFile('');

      expect(rules[0].owners).toEqual(['user1', 'user2']);
    });

    it('returns no rule for team rules', () => {
      sandbox.stub(repo, 'readFile').returns('- ampproject/team\n');
      const {rules} = parser.parseOwnersFile('');

      expect(rules).toEqual([]);
    });

    describe('dictionary rule declarations', () => {
      beforeEach(() => {
        sandbox
          .stub(repo, 'readFile')
          .returns('dict:\n  key: "value"\n  key2: "value2"\n');
      });
      it('returns no rule', () => {
        const {rules} = parser.parseOwnersFile('');

        expect(rules).toEqual([]);
      });

      it('returns a parser error', () => {
        const {errors} = parser.parseOwnersFile('foo/OWNERS.yaml');

        expect(errors[0].message).toEqual(
          "Failed to parse file 'foo/OWNERS.yaml'; must be a YAML list"
        );
      });
    });

    it('ignores non-string rules in the list', () => {
      sandbox
        .stub(repo, 'readFile')
        .returns('- owner\n- dict:\n  key: "value"\n  key2: "value2"\n');
      const {rules} = parser.parseOwnersFile('');

      expect(rules.length).toEqual(1);
    });
  });

  describe('parseAllOwnersRules', () => {
    it('reads all owners files in the repo', async () => {
      sandbox
        .stub(repo, 'findOwnersFiles')
        .returns(['OWNERS.yaml', 'foo/OWNERS.yaml']);
      const readFileStub = sandbox.stub(repo, 'readFile');
      readFileStub.onCall(0).returns('- user1\n- user2\n');
      readFileStub.onCall(1).returns('- user3\n- user4\n');
      const {rules} = await parser.parseAllOwnersRules();

      expect(rules[0].dirPath).toEqual('.');
      expect(rules[1].dirPath).toEqual('foo');
      expect(rules[0].owners).toEqual(['user1', 'user2']);
      expect(rules[1].owners).toEqual(['user3', 'user4']);
    });

    it('does not include invalid rules', async () => {
      sandbox.stub(repo, 'findOwnersFiles').returns(['OWNERS.yaml']);
      sandbox.stub(repo, 'readFile').returns('dict:\n  key: value');
      const {rules} = await parser.parseAllOwnersRules();

      expect(rules).toEqual([]);
    });

    it('collects errors from all parsed files', async () => {
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
      sandbox
        .stub(parser, 'parseAllOwnersRules')
        .returns({rules: [rootRule, childRule], errors: []});
      const {tree} = await parser.parseOwnersTree();

      expect(tree.rules).toContain(rootRule);
      expect(tree.get('foo').rules).toContain(childRule);
    });

    it('returns parser errors', async () => {
      sandbox
        .stub(parser, 'parseAllOwnersRules')
        .returns({rules: [], errors: [new Error('Oops!')]});
      const {errors} = await parser.parseOwnersTree();

      expect(errors[0].message).toEqual('Oops!');
    });
  });
});
