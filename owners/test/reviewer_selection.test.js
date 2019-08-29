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
  let ownersTree = new OwnersTree();

  const rootDirRule = new OwnersRule('OWNERS.yaml', ['root']);
  const childDirRule = new OwnersRule('foo/OWNERS.yaml', ['child']);
  const otherChildDirRule = new OwnersRule('biz/OWNERS.yaml', ['child']);
  const descendantDirRule = new OwnersRule('foo/bar/baz/OWNERS.yaml', [
    'descendant',
  ]);

  const rootDirTree = ownersTree.addRule(rootDirRule);
  const childDirTree = ownersTree.addRule(childDirRule);
  const otherChildDirTree = ownersTree.addRule(otherChildDirRule);
  const descendantDirTree = ownersTree.addRule(descendantDirRule);

  describe('nearestOwnersTrees', () => {
    it('returns the nearest trees', () => fail('not implemented'));
    it('does not return duplicates', () => fail('not implemented'));
  });

  describe('reviewersForTrees', () => {
    it('unions the owners for all subtrees', () => fail('not implemented'));
    it('does not include inherited owners', () => fail('not implemented'));
  });

  describe('findPotentialReviewers', () => {
    it('returns reviewers for the deepest trees',
       () => fail('not implemented'));
  });

  describe('filesOwnedByReviewer', () => {
    it('lists files for which the reviewer is an owner',
       () => fail('not implemented'));
  });

  describe('reviewersWithMostFiles', () => {
    it('returns a list of tuples of reviewers and files they own',
       () => fail('not implemented'));
    it('the reviewer(s) who own the most files', () => fail('not implemented'));
  });

  describe('pickBestReviewer', () => {
    it('builds a map from reviewers to files they own',
       () => fail('not implemented'));
    it('picks one of the reviewers with the most files',
       () => fail('not implemented'));
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
          ],
          ownersTree);

      expect(fileTreeMap).toEqual({
        './main.js': rootDirTree,
        './package.json': rootDirTree,
        'biz/style.css': otherChildDirTree,
        'foo/file.js': childDirTree,
        'foo/bar/other_file.js': childDirTree,
      });
    });
  });

  describe('pickReviewers', () => {
    it('picks reviewers until all files are covered',
       () => fail('not implemented'));
    it('throws an error if it fails to find reviewer coverage',
       () => fail('not implemented'));
  });
});
