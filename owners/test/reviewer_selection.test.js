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
const {OwnersTree} = require('../src/owners');
const {OwnersRule} = require('../src/rules');

describe('reviewer selection', () => {
  const sandbox = sinon.createSandbox();
  const ownersTree = new OwnersTree();

  const dirTrees = {
    '/': ownersTree.addRule(new OwnersRule('OWNERS.yaml', ['rootOwner'])),
    '/foo': ownersTree.addRule(new OwnersRule('foo/OWNERS.yaml', ['child'])),
    '/biz': ownersTree.addRule(
      new OwnersRule('biz/OWNERS.yaml', ['child', 'kid'])
    ),
    '/buzz': ownersTree.addRule(
      new OwnersRule('buzz/OWNERS.yaml', ['thirdChild'])
    ),
    '/foo/bar/baz': ownersTree.addRule(
      new OwnersRule('foo/bar/baz/OWNERS.yaml', ['descendant'])
    ),
  };

  afterEach(() => {
    sandbox.restore();
  });

  describe('nearestOwnersTrees', () => {
    it('returns the nearest trees', () => {
      const fileTreeMap = ownersTree.buildFileTreeMap([
        './main.js',
        'biz/style.css',
        'foo/bar/other_file.js',
      ]);
      const nearestTrees = ReviewerSelection._nearestOwnersTrees(fileTreeMap);

      expect(nearestTrees).toEqual(
        expect.arrayContaining([
          dirTrees['/'],
          dirTrees['/biz'],
          dirTrees['/foo'],
        ])
      );
    });

    it('does not return duplicates', () => {
      const fileTreeMap = ownersTree.buildFileTreeMap([
        'foo/file.js',
        'foo/bar/other_file.js',
      ]);
      const nearestTrees = ReviewerSelection._nearestOwnersTrees(fileTreeMap);

      expect(nearestTrees).toEqual([dirTrees['/foo']]);
    });
  });

  describe('reviewersForTrees', () => {
    it('unions the owners for all subtrees', () => {
      const reviewers = ReviewerSelection._reviewersForTrees([
        dirTrees['/biz'],
        dirTrees['/foo/bar/baz'],
      ]);

      expect(reviewers).toEqual(
        expect.arrayContaining(['child', 'kid', 'descendant'])
      );
    });

    it('does not include inherited owners', () => {
      const reviewers = ReviewerSelection._reviewersForTrees([
        dirTrees['/foo'],
      ]);

      expect(reviewers).not.toContain('rootOwner');
    });
  });

  describe('findPotentialReviewers', () => {
    it('returns reviewers for the deepest trees', () => {
      const fileTreeMap = ownersTree.buildFileTreeMap([
        './main.js',
        'biz/style.css',
        'foo/bar/other_file.js',
      ]);
      sandbox.stub(ReviewerSelection, '_reviewersForTrees').callThrough();
      const reviewers = ReviewerSelection._findPotentialReviewers(fileTreeMap);

      sandbox.assert.calledWith(
        ReviewerSelection._reviewersForTrees,
        sinon.match.array.contains([dirTrees['/foo'], dirTrees['/biz']])
      );
      expect(reviewers).toEqual(expect.arrayContaining(['child', 'kid']));
    });
  });

  describe('filesOwnedByReviewer', () => {
    const fileTreeMap = ownersTree.buildFileTreeMap([
      './main.js', // root
      'biz/style.css', // child, kid, root
      'foo/bar/other_file.js', // child, root
      'foo/bar/baz/README.md', // descendant, child, root
    ]);

    const filesOwnedMap = {
      'rootOwner': [
        './main.js',
        'biz/style.css',
        'foo/bar/other_file.js',
        'foo/bar/baz/README.md',
      ],
      'child': [
        'biz/style.css',
        'foo/bar/other_file.js',
        'foo/bar/baz/README.md',
      ],
      'kid': ['biz/style.css'],
      'descendant': ['foo/bar/baz/README.md'],
    };

    it.each(Object.entries(filesOwnedMap))(
      'lists files for %p',
      (reviewer, expectedFilesOwned) => {
        const filesOwned = ReviewerSelection._filesOwnedByReviewer(
          fileTreeMap,
          reviewer
        );

        expect(filesOwned).toEqual(expectedFilesOwned);
      }
    );
  });

  describe('reviewersWithMostFiles', () => {
    it('lists the reviewer(s) who own the most files', () => {
      const reviewerFiles = ReviewerSelection._reviewersWithMostFiles({
        child: ['foo/file.js', 'foo/bar/other_file.js'],
        kid: ['biz/style.css'],
        thirdChild: ['buzz/info.txt', 'buzz/code.js'],
      });

      expect(reviewerFiles).toEqual(
        expect.arrayContaining([
          ['child', ['foo/file.js', 'foo/bar/other_file.js']],
          ['thirdChild', ['buzz/info.txt', 'buzz/code.js']],
        ])
      );
    });
  });

  describe('pickBestReview', () => {
    const fileTreeMap = ownersTree.buildFileTreeMap([
      './main.js', // root
      'biz/style.css', // child, kid, root
      'foo/bar/other_file.js', // child, root
      'buzz/info.txt', // thirdChild, root
      'buzz/code.js', // thirdChild, root
    ]);

    it('builds a map from deepest reviewers to files they own', () => {
      sandbox.stub(ReviewerSelection, '_reviewersWithMostFiles').callThrough();
      ReviewerSelection._pickBestReview(fileTreeMap);

      sandbox.assert.calledWith(ReviewerSelection._reviewersWithMostFiles, {
        child: ['biz/style.css', 'foo/bar/other_file.js'],
        kid: ['biz/style.css'],
        thirdChild: ['buzz/info.txt', 'buzz/code.js'],
      });
    });

    it('picks one of the reviewers with the most files', () => {
      const [bestReviewer, filesCovered] = ReviewerSelection._pickBestReview(
        fileTreeMap
      );

      expect(['child', 'thirdChild']).toContain(bestReviewer);
      expect(filesCovered.length).toEqual(2);
    });
  });

  describe('pickReviews', () => {
    it('picks reviewers until all files are covered', () => {
      sandbox.stub(ReviewerSelection, '_pickBestReview').callThrough();
      const fileTreeMap = ownersTree.buildFileTreeMap([
        './main.js',
        'foo/file.js',
        'biz/style.css',
        'buzz/info.txt',
      ]);

      const reviews = ReviewerSelection.pickReviews(fileTreeMap);
      const reviewers = reviews.map(([reviewer, files]) => reviewer);

      sandbox.assert.calledThrice(ReviewerSelection._pickBestReview);
      expect(reviewers).toEqual(['child', 'thirdChild', 'rootOwner']);
    });

    it('can avoid adding high-level owners', () => {
      const fileTreeMap = ownersTree.buildFileTreeMap([
        'foo/file.js',
        'biz/style.css',
        'buzz/info.txt',
      ]);

      const reviews = ReviewerSelection.pickReviews(fileTreeMap);
      const reviewers = reviews.map(([reviewer, files]) => reviewer);

      expect(reviewers).toContain('child', 'thirdChild');
      expect(reviewers).not.toContain('rootOwner');
    });

    it('throws an error if it fails to find reviewer coverage', () => {
      sandbox.stub(ReviewerSelection, '_pickBestReview').returns(undefined);
      const fileTreeMap = ownersTree.buildFileTreeMap(['main.js']);

      expect(() => ReviewerSelection.pickReviews(fileTreeMap)).toThrow(
        'Could not select reviewers!'
      );
    });
  });
});
