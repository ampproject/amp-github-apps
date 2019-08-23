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
const sinon = require('sinon');
const {LocalRepository} = require('../src/local_repo');
const {OwnersParser, OwnersRule, OwnersTree} = require('../src/owners');

describe('owners tree', () => {
  let tree;
  const rootDirRule = new OwnersRule('OWNERS.yaml', ['root']);
  const childDirRule = new OwnersRule('foo/OWNERS.yaml', ['child']);
  const otherChildDirRule = new OwnersRule('biz/OWNERS.yaml', ['child']);
  const ancestorDirRule = new OwnersRule('foo/bar/baz/OWNERS.yaml', [
    'ancestor',
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
      tree.addRule(ancestorDirRule);
      expect(tree.children.foo.children.bar.children.baz.rules).toContain(
        ancestorDirRule
      );
    });
  });

  describe('depth', () => {
    it('should return 0 for the root', () => {
      expect(tree.depth).toEqual(0);
    });

    it('should return tree depth for files not at the root', () => {
      tree.addRule(childDirRule);
      tree.addRule(otherChildDirRule);
      tree.addRule(ancestorDirRule);

      expect(tree.children.foo.depth).toEqual(1);
      expect(tree.children.biz.depth).toEqual(1);
      expect(tree.children.foo.children.bar.children.baz.depth).toEqual(3);
    });
  });

  describe('rulesForFile', () => {
    it('should include rules for the directory', () => {
      tree.addRule(childDirRule);
      tree.addRule(otherChildDirRule);
      expect(tree.rulesForFile('foo/bar.txt')).toContain(childDirRule);
      expect(tree.rulesForFile('biz/bar.txt')).toContain(otherChildDirRule);
    });

    it('should include rules for the parent directories', () => {
      tree.addRule(rootDirRule);
      expect(tree.rulesForFile('foo/bar.txt')).toContain(rootDirRule);
    });

    it('should include rules in descending order of depth', () => {
      tree.addRule(rootDirRule);
      tree.addRule(childDirRule);
      tree.addRule(ancestorDirRule);
      expect(tree.rulesForFile('foo/bar/baz/buzz.txt')).toEqual([
        ancestorDirRule,
        childDirRule,
        rootDirRule,
      ]);
    });
  });

  describe('toString', () => {
    it('should draw the tree', () => {
      tree.addRule(rootDirRule);
      tree.addRule(childDirRule);
      tree.addRule(otherChildDirRule);
      tree.addRule(ancestorDirRule);

      expect(tree.toString()).toEqual(
        [
          'ROOT',
          '- root',
          '└---foo',
          '- child',
          '    └---bar',
          '        └---baz',
          '        - ancestor',
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
      expect('OWNERS.yaml').toMatchFile('foo.txt');
    });

    it('matches a file in a child directory', () => {
      expect('OWNERS.yaml').toMatchFile('foo/bar.txt');
    });

    it('matches a file in an ancestor directory', () => {
      expect('OWNERS.yaml').toMatchFile('foo/bar/baz.txt');
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
      sandbox.stub(fs, 'readFileSync').returns('');
      parser.parseOwnersFile('foo/OWNERS.yaml');
      sandbox.assert.calledWith(
        fs.readFileSync,
        'path/to/repo/foo/OWNERS.yaml',
        {encoding: 'utf8'}
      );
    });

    it('assigns the OWNERS directory path', () => {
      sandbox.stub(fs, 'readFileSync').returns('');
      const rule = parser.parseOwnersFile('foo/OWNERS.yaml');
      expect(rule.dirPath).toEqual('foo');
    });

    it('parses a YAML list', () => {
      sandbox.stub(fs, 'readFileSync').returns('- user1\n- user2\n');
      const rule = parser.parseOwnersFile('');
      expect(rule.owners).toEqual(['user1', 'user2']);
    });

    it('parses a YAML list with blank lines and comments', () => {
      sandbox
        .stub(fs, 'readFileSync')
        .returns('- user1\n# comment\n\n- user2\n');
      const rule = parser.parseOwnersFile('');
      expect(rule.owners).toEqual(['user1', 'user2']);
    });
  });

  describe('parseAllOwnersRules', () => {
    it('reads all owners files in the repo', () => {
      sandbox
        .stub(repo, 'findOwnersFiles')
        .returns(['OWNERS.yaml', 'foo/OWNERS.yaml']);
      const readFileStub = sandbox.stub(repo, 'readFile');
      readFileStub.onCall(0).returns('- user1\n- user2\n');
      readFileStub.onCall(1).returns('- user3\n- user4\n');
      const rules = parser.parseAllOwnersRules();

      expect(rules[0].dirPath).toEqual('.');
      expect(rules[1].dirPath).toEqual('foo');
      expect(rules[0].owners).toEqual(['user1', 'user2']);
      expect(rules[1].owners).toEqual(['user3', 'user4']);
    });
  });

  describe('parseOwnersTree', () => {
    const rootRule = new OwnersRule('OWNERS.yaml', ['user1', 'user2']);
    const childRule = new OwnersRule('foo/OWNERS.yaml', ['user3', 'user4']);

    it('adds each rule to the tree', () => {
      sandbox.stub(parser, 'parseAllOwnersRules').returns(
        [rootRule, childRule]);
      const tree = parser.parseOwnersTree();

      expect(tree.rules).toContain(rootRule);
      expect(tree.get('foo').rules).toContain(childRule);
    })
  });
});
