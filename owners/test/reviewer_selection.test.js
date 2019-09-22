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
const {Team} = require('../src/github');
const {UserOwner, TeamOwner, WildcardOwner} = require('../src/owner');
const {OwnersTree} = require('../src/owners_tree');
const {
  OwnersRule,
  PatternOwnersRule,
  SameDirPatternOwnersRule,
} = require('../src/rules');

describe('reviewer selection', () => {
  const sandbox = sinon.createSandbox();
  let ownersTree;

  const myTeam = new Team(42, 'ampproject', 'my_team');
  myTeam.members = ['child', 'kid'];

  const dirRules = {
    '/': new OwnersRule('OWNERS.yaml', [new UserOwner('rootOwner')]),
    '/foo': new OwnersRule('foo/OWNERS.yaml', [new UserOwner('child')]),
    '/biz': new OwnersRule('biz/OWNERS.yaml', [new TeamOwner(myTeam)]),
    '/buzz': new OwnersRule('buzz/OWNERS.yaml', [new UserOwner('thirdChild')]),
    '/foo/bar/baz': new OwnersRule('foo/bar/baz/OWNERS.yaml', [
      new UserOwner('descendant'),
    ]),
  };
  const wildcardRule = new OwnersRule('foo/bar/baz/OWNERS.yaml', [
    new WildcardOwner(),
  ]);

  beforeEach(() => {
    ownersTree = new OwnersTree();
    ownersTree.addRule(dirRules['/']);
    ownersTree.addRule(dirRules['/foo']);
    ownersTree.addRule(dirRules['/biz']);
    ownersTree.addRule(dirRules['/buzz']);
    ownersTree.addRule(dirRules['/foo/bar/baz']);
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe('deepestOwnersRules', () => {
    it('returns rules from the deepest trees', () => {
      const fileTreeMap = ownersTree.buildFileTreeMap([
        './main.js',
        'biz/style.css',
        'foo/bar/other_file.js',
      ]);
      const deepestRules = ReviewerSelection._deepestOwnersRules(fileTreeMap);

      expect(deepestRules).toContain(dirRules['/biz'], dirRules['/foo']);
    });

    it('excludes rules from higher-level trees', () => {
      const fileTreeMap = ownersTree.buildFileTreeMap([
        './main.js',
        'biz/style.css',
        'foo/bar/other_file.js',
      ]);
      const deepestRules = ReviewerSelection._deepestOwnersRules(fileTreeMap);

      expect(deepestRules).toContain(dirRules['/foo']);
      expect(deepestRules).not.toContain(dirRules['.']);
    });

    it('excludes rules with wildcard owners', () => {
      ownersTree.addRule(wildcardRule);
      const fileTreeMap = ownersTree.buildFileTreeMap([
        './main.js',
        'biz/style.css',
        'foo/bar/other_file.js',
      ]);
      const deepestRules = ReviewerSelection._deepestOwnersRules(fileTreeMap);

      expect(deepestRules).toContain(dirRules['/foo']);
      expect(deepestRules).not.toContain(dirRules['.']);
    });

    it('does not return duplicates', () => {
      const fileTreeMap = ownersTree.buildFileTreeMap([
        'foo/file.js',
        'foo/bar/other_file.js',
      ]);
      const deepestRules = ReviewerSelection._deepestOwnersRules(fileTreeMap);

      expect(deepestRules).toEqual([dirRules['/foo']]);
    });
  });

  describe('reviewersForRules', () => {
    it('unions the owners for all subtrees', () => {
      const reviewers = ReviewerSelection._reviewersForRules([
        dirRules['/biz'],
        dirRules['/foo/bar/baz'],
      ]);

      expect(reviewers).toEqual(
        expect.arrayContaining(['child', 'kid', 'descendant'])
      );
    });

    it('does not include inherited owners', () => {
      const reviewers = ReviewerSelection._reviewersForRules([
        dirRules['/foo'],
      ]);

      expect(reviewers).not.toContain('rootOwner');
    });

    describe('rule priority', () => {
      const sameDirPatternRule = new SameDirPatternOwnersRule(
        'priority/OWNERS.yaml',
        [new UserOwner('same_dir_pattern_owner')],
        '*.css'
      );
      const recursivePatternRule = new PatternOwnersRule(
        'priority/OWNERS.yaml',
        [new UserOwner('recursive_pattern_owner')],
        '*.js'
      );
      const directoryRule = new OwnersRule('priority/OWNERS.yaml', [
        new UserOwner('directory_owner'),
      ]);

      describe('when a same-directory pattern rule is present', () => {
        const reviewers = ReviewerSelection._reviewersForRules([
          directoryRule,
          recursivePatternRule,
          sameDirPatternRule,
        ]);

        it('returns same-directory pattern rule owners', () => {
          expect(reviewers).toContain('same_dir_pattern_owner');
        });

        it('does not return recursive pattern rule owners', () => {
          expect(reviewers).not.toContain('recursive_pattern_owner');
        });

        it('does not return directory owners', () => {
          expect(reviewers).not.toContain('directory_owner');
        });
      });

      describe('when no same-directory pattern rule is present', () => {
        describe('when a recursive pattern rule is present', () => {
          const reviewers = ReviewerSelection._reviewersForRules([
            directoryRule,
            recursivePatternRule,
          ]);

          it('returns recursive pattern rule owners', () => {
            expect(reviewers).toContain('recursive_pattern_owner');
          });

          it('does not return directory owners', () => {
            expect(reviewers).not.toContain('directory_owner');
          });
        });

        describe('when no recursive pattern rule is present', () => {
          it('returns directory owners', () => {
            const reviewers = ReviewerSelection._reviewersForRules([
              directoryRule,
            ]);
            expect(reviewers).toContain('directory_owner');
          });
        });
      });
    });
  });

  describe('findPotentialReviewers', () => {
    it('returns reviewers for the deepest trees', () => {
      const fileTreeMap = ownersTree.buildFileTreeMap([
        './main.js',
        'biz/style.css',
        'foo/bar/other_file.js',
      ]);
      sandbox.stub(ReviewerSelection, '_reviewersForRules').callThrough();
      const reviewers = ReviewerSelection._findPotentialReviewers(fileTreeMap);

      sandbox.assert.calledWith(
        ReviewerSelection._reviewersForRules,
        sinon.match.array.contains([dirRules['/foo'], dirRules['/biz']])
      );
      expect(reviewers).toEqual(expect.arrayContaining(['child', 'kid']));
    });
  });

  describe('filesOwnedByReviewer', () => {
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
    let fileTreeMap;

    beforeAll(() => {
      fileTreeMap = ownersTree.buildFileTreeMap([
        './main.js', // root
        'biz/style.css', // child, kid, root
        'foo/bar/other_file.js', // child, root
        'foo/bar/baz/README.md', // descendant, child, root
      ]);
    });

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
    let fileTreeMap;

    beforeAll(() => {
      fileTreeMap = ownersTree.buildFileTreeMap([
        './main.js', // root
        'biz/style.css', // child, kid, root
        'foo/bar/other_file.js', // child, root
        'buzz/info.txt', // thirdChild, root
        'buzz/code.js', // thirdChild, root
      ]);
    });

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
