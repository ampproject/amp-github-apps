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

const {OwnersTree} = require('../src/owners_tree');
const {Team} = require('../src/github');
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

describe('owners tree', () => {
  let tree;
  const rootDirRule = new OwnersRule('OWNERS.yaml', [
    new UserOwner('root', OWNER_MODIFIER.SILENT),
  ]);
  const childDirRule = new OwnersRule('foo/OWNERS.yaml', [
    new UserOwner('child', OWNER_MODIFIER.NOTIFY),
  ]);
  const otherChildDirRule = new OwnersRule('biz/OWNERS.yaml', [
    new UserOwner('child', OWNER_MODIFIER.SILENT),
  ]);
  const descendantDirRule = new OwnersRule('foo/bar/baz/OWNERS.yaml', [
    new UserOwner('descendant', OWNER_MODIFIER.NOTIFY),
  ]);
  const wildcardDirRule = new OwnersRule('shared/OWNERS.yaml', [
    new WildcardOwner(),
  ]);

  const testerTeam = new Team(42, 'ampproject', 'testers');
  testerTeam.members.push('tester');
  const testFileRule = new PatternOwnersRule(
    'OWNERS.yaml',
    [new TeamOwner(testerTeam)],
    '*.test.js'
  );

  const packageJsonRule = new SameDirPatternOwnersRule(
    'OWNERS.yaml',
    [new UserOwner('anyone')],
    'package.json'
  );

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

  describe('fileRules', () => {
    let childTree;

    beforeEach(() => {
      tree.addRule(testFileRule);
      tree.addRule(packageJsonRule);

      childTree = tree.atPath('foo/bar.txt');
    });

    it('should include rules matching the filename', () => {
      expect(childTree.fileRules('foo/script.test.js')).toContain(testFileRule);
    });

    it('should exclude rules which do not match', () => {
      expect(childTree.fileRules('foo/package.json')).not.toContain(
        packageJsonRule
      );
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
      tree.addRule(descendantDirRule);

      expect(tree.atPath('foo/bar/okay.txt').dirPath).toEqual('foo');
    });

    it('works on a non-root subtree', () => {
      tree.addRule(rootDirRule);
      const childTree = tree.addRule(childDirRule);
      tree.addRule(descendantDirRule);

      expect(childTree.atPath('foo/bar/baz/okay.txt').dirPath).toEqual(
        'foo/bar/baz'
      );
    });

    it('throws an error when requesting a path not under the subtree', () => {
      const childTree = tree.addRule(childDirRule);

      expect(() => childTree.atPath('not/in/foo.txt')).toThrow(
        'Tried to find subtree at path "not/in/foo.txt" on a subtree at path "foo"'
      );
    });
  });

  describe('getModifiedOwners', () => {
    beforeEach(() => {
      tree.addRule(rootDirRule);
      tree.addRule(childDirRule);
      tree.addRule(descendantDirRule);
    });

    it('finds matching owners in the subtree', () => {
      const subtree = tree.atPath('foo/file.js');
      const modifiedOwners = subtree.getModifiedOwners(OWNER_MODIFIER.NOTIFY);

      expect(modifiedOwners).toContainEqual(
        new UserOwner('child', OWNER_MODIFIER.NOTIFY)
      );
    });

    it('finds matching owners in parent trees', () => {
      const subtree = tree.atPath('foo/bar/baz/file.js');
      const modifiedOwners = subtree.getModifiedOwners(OWNER_MODIFIER.NOTIFY);

      expect(modifiedOwners).toContainEqual(
        new UserOwner('descendant', OWNER_MODIFIER.NOTIFY),
        new UserOwner('child', OWNER_MODIFIER.NOTIFY)
      );
    });

    it('does not return non-matching owners', () => {
      const subtree = tree.atPath('foo/file.js');
      const modifiedOwners = subtree.getModifiedOwners(OWNER_MODIFIER.NOTIFY);

      expect(modifiedOwners).not.toContainEqual(
        new UserOwner('root', OWNER_MODIFIER.SILENT)
      );
    });

    it('does not return duplicate owners', () => {
      tree.addRule(
        new OwnersRule('OWNERS.yaml', [
          new UserOwner('child', OWNER_MODIFIER.NOTIFY),
        ])
      );
      const subtree = tree.atPath('foo/file.js');
      const modifiedOwners = subtree.getModifiedOwners(OWNER_MODIFIER.NOTIFY);

      expect(modifiedOwners.length).toEqual(1);
    });
  });

  describe('fileHasOwner', () => {
    beforeEach(() => {
      tree.addRule(rootDirRule);
      tree.addRule(childDirRule);
      tree.addRule(descendantDirRule);
      tree.addRule(wildcardDirRule);
      tree.addRule(testFileRule);
      tree.addRule(packageJsonRule);
    });

    it('should be true for owners in the same directory', () => {
      expect(tree.fileHasOwner('foo/bar.txt', 'child')).toBe(true);
    });

    it('should be true for owners in the parent directory', () => {
      expect(tree.fileHasOwner('foo/bar.txt', 'root')).toBe(true);
    });

    it('should be true for owners in an ancestor directory', () => {
      expect(tree.fileHasOwner('foo/bar.txt', 'root')).toBe(true);
    });

    it('should be false for owners in a child directory', () => {
      expect(tree.fileHasOwner('foo/bar/baz/buzz.txt', 'descendant')).toBe(
        true
      );
    });

    it('should be false for non-existant owners', () => {
      expect(tree.fileHasOwner('foo/bar.txt', 'not_an_owner')).toBe(false);
    });

    it('should be true for files in directories with wildcard owners', () => {
      expect(tree.fileHasOwner('shared/README.md', 'not_an_owner')).toBe(true);
      expect(tree.fileHasOwner('shared/README.md', 'anyone')).toBe(true);
    });

    it('should respect pattern-based rules', () => {
      expect(tree.fileHasOwner('foo/bar/thing.test.js', 'tester')).toBe(true);
      expect(tree.fileHasOwner('foo/bar/thing.js', 'tester')).toBe(false);
    });

    it('should respect same-directory rules', () => {
      expect(tree.fileHasOwner('package.json', 'anyone')).toBe(true);
      expect(tree.fileHasOwner('examples/package.json', 'anyone')).toBe(false);
    });
  });

  describe('buildFileTreeMap', () => {
    it('builds a map from filenames to subtrees', () => {
      const dirTrees = {
        '/': tree.addRule(rootDirRule),
        '/foo': tree.addRule(rootDirRule),
        '/biz': tree.addRule(rootDirRule),
      };
      const fileTreeMap = tree.buildFileTreeMap([
        './main.js',
        './package.json',
        'biz/style.css',
        'foo/file.js',
        'foo/bar/other_file.js',
        'buzz/info.txt',
        'buzz/code.js',
      ]);

      expect(fileTreeMap).toEqual({
        './main.js': dirTrees['/'],
        './package.json': dirTrees['/'],
        'biz/style.css': dirTrees['/biz'],
        'foo/file.js': dirTrees['/foo'],
        'foo/bar/other_file.js': dirTrees['/foo'],
        'buzz/info.txt': dirTrees['/'],
        'buzz/code.js': dirTrees['/'],
      });
    });
  });

  describe('toString', () => {
    it('should draw the tree', () => {
      tree.addRule(rootDirRule);
      tree.addRule(childDirRule);
      tree.addRule(otherChildDirRule);
      tree.addRule(descendantDirRule);
      tree.addRule(wildcardDirRule);
      tree.addRule(testFileRule);
      tree.addRule(packageJsonRule);

      expect(tree.toString()).toEqual(
        [
          'ROOT',
          ' • **/*: root (never notify)',
          ' • **/*.test.js: ampproject/testers [tester]',
          ' • ./package.json: anyone',
          '└───foo',
          ' • **/*: child (always notify)',
          '    └───bar',
          '        └───baz',
          '         • **/*: descendant (always notify)',
          '└───biz',
          ' • **/*: child (never notify)',
          '└───shared',
          ' • **/*: *',
        ].join('\n')
      );
    });
  });
});
