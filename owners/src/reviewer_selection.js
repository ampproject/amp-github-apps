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

/**
******************
=== Reviewer Selection ===

-- Overview --

Inputs: a map from files needing approval to the nearest ownership subtree

1. Select the set of ownership rules at the greatest depth in the tree (referred
   to as "deepest rules" going forward) and union all owners; this is the set of
   potential reviewers.
2. For each potential reviewer, count the number of files they can approve, and
   select whichever potential reviewer could cover the most additional files.
3. Remove all files from the set that can be approved by the new reviewer, and
   all ownership rules which are fully satisfied/which contain the new reviewer.

Repeat until all files have an OWNER in the reviewer set.

-- Detailed Algorithm Python/Pseudocode --

> Note: Pseudocode is effectively Python, since it's easy to parse and has
        powerful collections natives (sets, iteration helpers, etc.)

def buildFileTreeMap(filenames, ownersTree):
  return dict(filename: ownersTree.atPath(filename) for filename in filenames)

- Part 1 -

def reviewersForTrees(deepestTrees):
  reviewers = set()
  for tree in deepestTrees:
    for rule in tree.rules:
      reviewers.add(*rule.owners)
  return reviewers

def findPotentialReviewers(fileTreeMap)
  nearestTrees = fileTreeMap.values()
  maxDepth = max(tree.depth for tree in nearestTrees)
  deepestTrees = filter(nearestTrees, lambda tree: tree.depth == maxDepth)
  return reviewersForTrees(deepestTrees)

- Part 2 -

def filesOwnedByReviwer(fileTreeMap, reviewer):
  return [filename for filename, tree in fileTreeMap.items()
          if tree.hasOwner(reviewer)]

def reviewersWithMostFiles(reviewerFilesMap):
  mostFilesOwned = max(reviewerFilesMap.values().map(len))
  return filter(reviewerFileMap.items,
                lambda reviewer, files: len(files) == mostFilesOwned)

def pickBestReviewer(fileTreeMap):
  reviewerSet = findPotentialReviewers(fileTreeMap)
  reviewerFilesMap = {reviewer: filesOwnedByReviewer(fileTreeMap, reviewer)
                      for reviewer in reviewerSet}
  return choice(reviewerWithMostFiles(reviewerFilesMap))

- Part 3 -

def pickReviweers(fileTreeMap):
  reviewers = []

  while len(fileTreeMap):
    nextReviewer, coveredFiles = pickBestReviewer(fileTreeMap)
    reviewers.append(nextReviewer)
    for filename in coveredFiles:
      del fileTreeMap[filename]

  return reviewers

*******************
*/

/**
 * A map from filenames to the nearest ownership subtree.
 *
 * @typedef {!Object<string, !OwnersTree>}
 */
let FileTreeMap;

/**
 * A tuple of a reviewer username and the files they need to approve.
 *
 * @typedef {!Tuple<!string, string[]>}
 */
let ReviewerFiles;

/**
 * Class implementing the reviewer selection algorithm.
 */
class ReviewerSelection {
  /**********
   * Part 1 *
   **********/

  /**
   * Produce a set of all ownership subtrees directly owning a changed file.
   *
   * @private
   * @param {!FileTreeMap} fileTreeMap map from filenames to ownership subtrees.
   * @return {Set<OwnersTree>} a set of the nearest ownership subtrees.
   */
  static _nearestOwnersTrees(fileTreeMap) {
    const trees = new Set(Object.values(fileTreeMap));
    return Array.from(trees);
  }

  /**
   * Produce the set of all owners for a set of ownership trees.
   *
   * @private
   * @param {OwnersTree[]} trees list of ownership trees.
   * @returns {string[]} union of reviewers lists for all trees.
   */
  static _reviewersForTrees(trees) {
    const reviewers = new Set();
    trees.forEach(tree => {
      tree.rules.forEach(rule => reviewers.add(...rule.owners));
    });
    return Array.from(reviewers);
  }

  /**
   * Produce a list of reviewers to satisfy at least one of the deepest ownership
   * rules.
   *
   * @private
   * @param {!FileTreeMap} fileTreeMap map from filenames to ownership subtrees.
   */
  static _findPotentialReviewers(fileTreeMap) {
    const nearestTrees = _nearestOwnersTrees(fileTreeMap);
    const maxDepth = Math.max(...nearestTrees.map(tree => tree.depth));
    const deepestTrees = nearestTrees.filter(tree => tree.depth === maxDepth);
    return _reviewersForTrees(deepestTrees);
  }

  /**********
   * Part 2 *
   **********/

  /**
   * List files owned by a reviewer.
   *
   * @private
   * @param {!FileTreeMap} fileTreeMap map from filenames to ownership subtrees.
   * @param {!string} reviewer reviewer username.
   * @return {string[]} list of filenames.
   */
  static _filesOwnedByReviewer(fileTreeMap, reviewer) {
    return Object.entries(fileTreeMap)
        .filter(([filename, tree]) => tree.hasOwner(reviewer))
        .map(([filename, tree]) => filename);
  }

  /**
   * Identifies the reviewer(s) who can approve the most files.
   *
   * @private
   * @param {!Object<string, string[]>} reviewerFilesMap map from reviewer
   *     usernames to the list of files they own.
   * @return {string[]} list of reviewer usernames.
   */
  static _reviewersWithMostFiles(reviewerFilesMap) {
    const mostFilesOwned =
        Math.max(...Object.values(reviewerFilesMap).map(files => files.length));
    return Object.entries(reviewerFilesMap)
        .filter(([reviewer, files]) => files.length == mostFilesOwned);
  }

  /**
   * Picks the best reviewer to satisfy the deepest rules.
   *
   * @private
   * Chooses randomly from the set of best possible reviewers to allow even
   * distribution of reviews.
   *
   * @param {!FileTreeMap} fileTreeMap map from filenames to ownership subtrees.
   * @return {ReviewerFiles} tuple of a reviewer username and the files they own.
   */
  static _pickBestReviewer(fileTreeMap) {
    const reviewerSet = _findPotentialReviewers(fileTreeMap);
    const reviewerFilesMap = {};
    reviewerSet.forEach(reviewer => {
      reviewerFilesMap[reviewer] = _filesOwnedByReviewer(fileTreeMap, reviewer);
    });
    const bestReviewers = _reviewersWithMostFiles(reviewerFilesMap);
    return bestReviewers[Math.floor(Math.random() * bestReviewers.length)];
  }

  /**********
   * Part 3 *
   **********/

  /**
   * Builds the map from filenames to ownership subtrees.
   *
   * @param {string[]} filenames list of changed files.
   * @param {!OwnersTree} ownersTree root node of the ownership tree.
   * @return {FileTreeMap} map from filenames to nearest ownership subtrees.
   */
  static buildFileTreeMap(filenames, ownersTree) {
    const fileTreeMap = {};
    filenames.forEach(filename => {
      fileTreeMap[filename] = ownersTree.atPath(filename);
    });
    return fileTreeMap;
  }

  /**
   * Picks a set of reviewers to approve the PR.
   *
   * @throws {Error} if the algorithm fails to select reviewers.
   * @param {!FileTreeMap} fileTreeMap map from filenames to ownership subtrees.
   * @return {ReviewerFiles[]} list of reviewers and the files they cover, in
   *     decreasing order of ownership depth.
   */
  static pickReviewers(fileTreeMap) {
    reviewers = [];

    while (Object.entries(fileTreeMap).length) {
      [nextReviewer, coveredFiles] = _pickBestReviewer(fileTreeMap);
      if (!nextReviewer) {
        throw Error('Could not select reviewers!');
      }
      reviewers.push([nextReviewer, coveredFiles]);
      coveredFiles.forEach(filename => delete fileTreeMap[filename]);
    }

    return reviewers;
  }
}

module.exports = {ReviewerSelection}
