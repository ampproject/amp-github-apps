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
const {ReviewerSelection} = require('../src/reviewer_selection');
const {OwnersRule, OwnersTree} = require('../src/owners');

describe('reviewer selection', () => {
  const sandbox = sinon.createSandbox();
  let ownersTree = new OwnersTree();

  const rootDirRule = new OwnersRule('OWNERS.yaml', ['root']);
  const childDirRule = new OwnersRule('foo/OWNERS.yaml', ['child']);
  const otherChildDirRule = new OwnersRule('biz/OWNERS.yaml', ['child', 'kid']);
  const thirdChildDirRule = new OwnersRule('buzz/OWNERS.yaml', ['thirdChild']);
  const descendantDirRule = new OwnersRule('foo/bar/baz/OWNERS.yaml', [
    'descendant',
  ]);

  const rootDirTree = ownersTree.addRule(rootDirRule);
  const childDirTree = ownersTree.addRule(childDirRule);
  const otherChildDirTree = ownersTree.addRule(otherChildDirRule);
  const thirdChildDirTree = ownersTree.addRule(thirdChildDirRule);
  const descendantDirTree = ownersTree.addRule(descendantDirRule);

  afterEach(() => {
    sandbox.restore();
  });

  describe('nearestOwnersTrees', () => {
    it('returns the nearest trees', () => {
      const fileTreeMap = ReviewerSelection.buildFileTreeMap(
          ['./main.js', 'biz/style.css', 'foo/bar/other_file.js'], ownersTree);
      const nearestTrees = ReviewerSelection._nearestOwnersTrees(fileTreeMap);

      expect(nearestTrees).toEqual(expect.arrayContaining([
        rootDirTree, otherChildDirTree, childDirTree
      ]));
    });

    it('does not return duplicates', () => {
      const fileTreeMap = ReviewerSelection.buildFileTreeMap(
          ['foo/file.js', 'foo/bar/other_file.js'], ownersTree);
      const nearestTrees = ReviewerSelection._nearestOwnersTrees(fileTreeMap);

      expect(nearestTrees).toEqual([childDirTree]);
    });
  });

  describe('reviewersForTrees', () => {
    it('unions the owners for all subtrees', () => {
      const reviewers = ReviewerSelection._reviewersForTrees(
          [otherChildDirTree, descendantDirTree]);

      expect(reviewers).toEqual(
          expect.arrayContaining(['child', 'kid', 'descendant']));
    });

    it('does not include inherited owners', () => {
      const reviewers = ReviewerSelection._reviewersForTrees([childDirTree]);

      expect(reviewers).not.toContain('root');
    });
  });

  describe('findPotentialReviewers', () => {
    it('returns reviewers for the deepest trees', () => {
      const fileTreeMap = ReviewerSelection.buildFileTreeMap(
          [
            './main.js',
            'biz/style.css',
            'foo/bar/other_file.js',
          ],
          ownersTree);
      sandbox.stub(ReviewerSelection, '_reviewersForTrees').callThrough();
      const reviewers = ReviewerSelection._findPotentialReviewers(fileTreeMap);

      sandbox.assert.calledWith(
          ReviewerSelection._reviewersForTrees,
          sinon.match.array.contains([childDirTree, otherChildDirTree]))
      expect(reviewers).toEqual(expect.arrayContaining(['child', 'kid']));
    });
  });

  describe('filesOwnedByReviewer', () => {
    it('lists files for which the reviewer is an owner', () => {
      const fileTreeMap = ReviewerSelection.buildFileTreeMap(
          [
            './main.js',              // root
            'biz/style.css',          // child, kid, root
            'foo/bar/other_file.js',  // child, root
            'foo/bar/baz/README.md',  // descendant, child, root
          ],
          ownersTree);
      const rootFiles =
          ReviewerSelection._filesOwnedByReviewer(fileTreeMap, 'root');
      const childFiles =
          ReviewerSelection._filesOwnedByReviewer(fileTreeMap, 'child');
      const kidFiles =
          ReviewerSelection._filesOwnedByReviewer(fileTreeMap, 'kid');
      const descendantFiles =
          ReviewerSelection._filesOwnedByReviewer(fileTreeMap, 'descendant');

      expect(rootFiles).toEqual([
        './main.js',
        'biz/style.css',
        'foo/bar/other_file.js',
        'foo/bar/baz/README.md',
      ]);
      expect(childFiles).toEqual([
        'biz/style.css', 'foo/bar/other_file.js', 'foo/bar/baz/README.md'
      ]);
      expect(kidFiles).toEqual(['biz/style.css']);
      expect(descendantFiles).toEqual(['foo/bar/baz/README.md']);
    });
  });

  describe('reviewersWithMostFiles', () => {
    it('lists the reviewer(s) who own the most files', () => {
      const reviewerFiles = ReviewerSelection._reviewersWithMostFiles({
        child: ['foo/file.js', 'foo/bar/other_file.js'],
        kid: ['biz/style.css'],
        thirdChild: ['buzz/info.txt', 'buzz/code.js'],
      });

      expect(reviewerFiles).toEqual(expect.arrayContaining([
        ['child', ['foo/file.js', 'foo/bar/other_file.js']],
        ['thirdChild', ['buzz/info.txt', 'buzz/code.js']],
      ]));
    });
  });

  describe('pickBestReviewer', () => {
    const fileTreeMap = ReviewerSelection.buildFileTreeMap(
        [
          './main.js',              // root
          'biz/style.css',          // child, kid, root
          'foo/bar/other_file.js',  // child, root
          'buzz/info.txt',          // thirdChild, root
          'buzz/code.js',           // thirdChild, root
        ],
        ownersTree);

    it('builds a map from deepest reviewers to files they own', () => {
      sandbox.stub(ReviewerSelection, '_reviewersWithMostFiles').callThrough();
      ReviewerSelection._pickBestReviewer(fileTreeMap);

      sandbox.assert.calledWith(ReviewerSelection._reviewersWithMostFiles, {
        child: ['biz/style.css', 'foo/bar/other_file.js'],
        kid: ['biz/style.css'],
        thirdChild: ['buzz/info.txt', 'buzz/code.js'],
      });
    });

    it('picks one of the reviewers with the most files', () => {
      const [bestReviewer, filesCovered] =
          ReviewerSelection._pickBestReviewer(fileTreeMap);

      expect(['child', 'thirdChild']).toContain(bestReviewer);
      expect(filesCovered.length).toEqual(2);
    });
  });

  describe('buildFileTreeMap', () => {
    it('builds a map from filenames to subtrees', () => {
      const fileTreeMap = ReviewerSelection.buildFileTreeMap(
          [
            './main.js',
            './package.json',
            'biz/style.css',
            'foo/file.js',
            'foo/bar/other_file.js',
            'buzz/info.txt',
            'buzz/code.js',
          ],
          ownersTree);

      expect(fileTreeMap).toEqual({
        './main.js': rootDirTree,
        './package.json': rootDirTree,
        'biz/style.css': otherChildDirTree,
        'foo/file.js': childDirTree,
        'foo/bar/other_file.js': childDirTree,
        'buzz/info.txt': thirdChildDirTree,
        'buzz/code.js': thirdChildDirTree,
      });
    });
  });

  describe('pickReviewers', () => {
    let fileTreeMap;
    let bestReviewerStub;

    beforeEach(() => {
      bestReviewerStub = sandbox.stub(ReviewerSelection, '_pickBestReviewer');
      fileTreeMap = ReviewerSelection.buildFileTreeMap(
          [
            './main.js',
            'foo/file.js',
            'biz/style.css',
            'buzz/info.txt',
          ],
          ownersTree);
    });

    it('picks reviewers until all files are covered', () => {
      bestReviewerStub.callThrough();
      const reviews = ReviewerSelection.pickReviewers(fileTreeMap);
      const reviewers = reviews.map(([reviewer, files]) => reviewer);

      sandbox.assert.calledThrice(ReviewerSelection._pickBestReviewer);
      expect(reviewers).toEqual(['child', 'thirdChild', 'root']);
    });

    it('throws an error if it fails to find reviewer coverage', () => {
      bestReviewerStub.returns(undefined);

      expect(() => ReviewerSelection.pickReviewers(fileTreeMap)).toThrow();
    });
  });
});
