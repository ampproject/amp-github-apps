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
const {LocalRepository} = require('../src/local_repo');
const {OwnersParser, OwnersRule, OwnersTree} = require('../src/owners');

describe('owners tree', () => {
  let tree;
  const rootDirRule = new OwnersRule('OWNERS.yaml', ['root']);
  const childDirRule = new OwnersRule('foo/OWNERS.yaml', ['child']);
  const otherChildDirRule = new OwnersRule('biz/OWNERS.yaml', ['child']);
  const descendantDirRule = new OwnersRule('foo/bar/baz/OWNERS.yaml', [
    'descendant',
  ]);

  beforeEach(() => {
    tree = new OwnersTree();
  });

  describe('addRule', () => {
    it('adds rules to the tree structure', () => {
      tree.addRule(rootDirRule);

      expect(tree.rules).toContain(rootDirRule);
    });

    it('adds rules to subdirectories', () => {
      tree.addRule(childDirRule);
      tree.addRule(otherChildDirRule);

      expect(tree.children.foo.rules).toContain(childDirRule);
      expect(tree.children.biz.rules).toContain(otherChildDirRule);
    });

    it('adds rules to nested subdirectories', () => {
      tree.addRule(descendantDirRule);

      expect(tree.children.foo.children.bar.children.baz.rules).toContain(
        descendantDirRule
      );
    });

    it('returns the subtree the rule was added to', () => {
      const subtree = tree.addRule(descendantDirRule);

      expect(subtree.dirPath).toEqual('foo/bar/baz');
    });
  });

  describe('depth', () => {
    it('should return 0 for the root', () => {
      expect(tree.depth).toEqual(0);
    });

    it('should return tree depth for files not at the root', () => {
      tree.addRule(childDirRule);
      tree.addRule(otherChildDirRule);
      tree.addRule(descendantDirRule);

      expect(tree.children.foo.depth).toEqual(1);
      expect(tree.children.biz.depth).toEqual(1);
      expect(tree.children.foo.children.bar.children.baz.depth).toEqual(3);
    });
  });

  describe('allRules', () => {
    let childTree;
    let descendantTree;

    beforeEach(() => {
      tree.addRule(rootDirRule);
      tree.addRule(childDirRule);
      tree.addRule(descendantDirRule);

      childTree = tree.atPath('foo/bar.txt');
      descendantTree = tree.atPath('foo/bar/baz/buzz.txt');
    });

    it('should include rules for the starting directory', () => {
      expect(childTree.allRules).toContain(childDirRule);
    });

    it('should include rules for the parent directory', () => {
      expect(childTree.allRules).toContain(rootDirRule);
    });

    it('should include rules for ancestor directories', () => {
      expect(descendantTree.allRules).toContain(rootDirRule);
    });

    it('should include rules in descending order of depth', () => {
      expect(descendantTree.allRules).toEqual([
        descendantDirRule,
        childDirRule,
        rootDirRule,
      ]);
    });
  });

  describe('atPath', () => {
    it("should produce the tree for the file's directory", () => {
      tree.addRule(childDirRule);
      tree.addRule(otherChildDirRule);

      expect(tree.atPath('foo/bar.txt').dirPath).toEqual('foo');
      expect(tree.atPath('biz/bar.txt').dirPath).toEqual('biz');
    });

    it('works for a directory path without a file', () => {
      tree.addRule(descendantDirRule);

      expect(tree.atPath('foo/bar/baz').dirPath).toEqual('foo/bar/baz');
    });

    it('returns the nearest tree with a rule', () => {
      tree.addRule(childDirRule);

      expect(tree.atPath('foo/bar/baz').dirPath).toEqual('foo');
    });
  });

  describe('hasOwner', () => {
    beforeEach(() => {
      tree.addRule(rootDirRule);
      tree.addRule(childDirRule);
      tree.addRule(descendantDirRule);
    });

    it('should be true for owners in the same directory', () => {
      expect(tree.atPath('foo/bar.txt').hasOwner('child')).toBe(true);
    });

    it('should be true for owners in the parent directory', () => {
      expect(tree.atPath('foo/bar.txt').hasOwner('root')).toBe(true);
    });

    it('should be true for owners an ancestor directory', () => {
      expect(tree.atPath('foo/bar.txt').hasOwner('root')).toBe(true);
    });

    it('should be false for owners a child directory', () => {
      expect(tree.atPath('foo/bar/baz/buzz.txt').hasOwner('descendant')).toBe(
        true
      );
    });

    it('should be false for non-existant owners', () => {
      expect(tree.atPath('foo/bar.txt').hasOwner('not_an_owner')).toBe(false);
    });
  });

  describe('toString', () => {
    it('should draw the tree', () => {
      tree.addRule(rootDirRule);
      tree.addRule(childDirRule);
      tree.addRule(otherChildDirRule);
      tree.addRule(descendantDirRule);

      expect(tree.toString()).toEqual(
        [
          'ROOT',
          '- root',
          '└---foo',
          '- child',
          '    └---bar',
          '        └---baz',
          '        - descendant',
          '└---biz',
          '- child',
        ].join('\n')
      );
    });
  });
});

describe('owners rules', () => {
  describe('matchesFile', () => {
    expect.extend({
      toMatchFile(receivedOwnersPath, filePath) {
        const rule = new OwnersRule(receivedOwnersPath, []);
        const matches = rule.matchesFile(filePath);
        const matchStr = this.isNot ? 'not match' : 'match';

        return {
          pass: matches,
          message: () =>
            `Expected rules in '${receivedOwnersPath}' to ` +
            `${matchStr} file '${filePath}'.`,
        };
      },
    });

    it('matches a file in the same directory', () => {
      expect('src/OWNERS.yaml').toMatchFile('src/foo.txt');
    });

    it('matches a file in a child directory', () => {
      expect('src/OWNERS.yaml').toMatchFile('src/foo/bar.txt');
    });

    it('matches a file in an descendant directory', () => {
      expect('src/OWNERS.yaml').toMatchFile('src/foo/bar/baz.txt');
    });

    it('does not match a file in a parent directory', () => {
      expect('src/OWNERS.yaml').not.toMatchFile('foo.txt');
    });

    it('does not match a file in a sibling directory', () => {
      expect('src/OWNERS.yaml').not.toMatchFile('test/foo.txt');
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
