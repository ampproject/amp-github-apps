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
      const rule = parser.parseOwnersFile('foo/OWNERS.yaml');

      expect(rule.dirPath).toEqual('foo');
    });

    it('parses a YAML list', () => {
      sandbox.stub(repo, 'readFile').returns('- user1\n- user2\n');
      const rule = parser.parseOwnersFile('');

      expect(rule.owners).toEqual(['user1', 'user2']);
    });

    it('parses a YAML list with blank lines and comments', () => {
      sandbox.stub(repo, 'readFile').returns('- user1\n# comment\n\n- user2\n');
      const rule = parser.parseOwnersFile('');

      expect(rule.owners).toEqual(['user1', 'user2']);
    });

    it('returns null for team rules', () => {
      sandbox.stub(repo, 'readFile').returns('- ampproject/team\n');
      const rule = parser.parseOwnersFile('');

      expect(rule).toBe(null);
    });

    it('returns null for non-list OWNERS file structures', () => {
      sandbox
        .stub(repo, 'readFile')
        .returns('dict:\n  key: "value"\n  key2: "value2"\n');
      const rule = parser.parseOwnersFile('');

      expect(rule).toBe(null);
    });

    it('ignores non-string rules in the list', () => {
      sandbox
        .stub(repo, 'readFile')
        .returns('- owner\n- dict:\n  key: "value"\n  key2: "value2"\n');
      const rule = parser.parseOwnersFile('');

      expect(rule.owners).toEqual(['owner']);
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
      const rules = await parser.parseAllOwnersRules();

      expect(rules[0].dirPath).toEqual('.');
      expect(rules[1].dirPath).toEqual('foo');
      expect(rules[0].owners).toEqual(['user1', 'user2']);
      expect(rules[1].owners).toEqual(['user3', 'user4']);
    });

    it('does not include invalid rules', async () => {
      sandbox.stub(repo, 'findOwnersFiles').returns(['OWNERS.yaml']);
      sandbox.stub(repo, 'readFile').returns('dict:\n  key: value');
      const rules = await parser.parseAllOwnersRules();

      expect(rules).toEqual([]);
    });
  });

  describe('parseOwnersTree', () => {
    const rootRule = new OwnersRule('OWNERS.yaml', ['user1', 'user2']);
    const childRule = new OwnersRule('foo/OWNERS.yaml', ['user3', 'user4']);

    it('adds each rule to the tree', async () => {
      sandbox
        .stub(parser, 'parseAllOwnersRules')
        .returns([rootRule, childRule]);
      const tree = await parser.parseOwnersTree();

      expect(tree.rules).toContain(rootRule);
      expect(tree.get('foo').rules).toContain(childRule);
    });
  });
});
