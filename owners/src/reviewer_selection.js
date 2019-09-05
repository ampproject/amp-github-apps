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

=== Reviewer Selection Algorithm ===

Inputs: a map from files needing approval to the nearest ownership subtree

1. Select the set of ownership rules at the greatest depth in the tree (referred
   to as "deepest rules" going forward) and union all owners; this is the set of
   potential reviewers.
2. For each potential reviewer, count the number of files they can approve, and
   select whichever potential reviewer could cover the most additional files.
3. Remove all files from the set that can be approved by the new reviewer, and
   all ownership rules which are fully satisfied/which contain the new reviewer.

Repeat until all files have an OWNER in the reviewer set.

*/

/**
 * Class implementing the reviewer selection algorithm.
 */
class ReviewerSelection {
  /** Part 1 **/

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
   * @return {string[]} union of reviewers lists for all trees.
   */
  static _reviewersForTrees(trees) {
    const reviewers = new Set();
    trees.forEach(tree => {
      tree.rules.forEach(rule => {
        rule.owners.forEach(owner => reviewers.add(owner));
      });
    });
    return Array.from(reviewers);
  }

  /**
   * Produce a list of reviewers to satisfy at least one of the deepest
   * ownership rules.
   *
   * @private
   * @param {!FileTreeMap} fileTreeMap map from filenames to ownership subtrees.
   * @return {string[]} list of reviewer usernames.
   */
  static _findPotentialReviewers(fileTreeMap) {
    const nearestTrees = this._nearestOwnersTrees(fileTreeMap);
    const maxDepth = Math.max(...nearestTrees.map(tree => tree.depth));
    const deepestTrees = nearestTrees.filter(tree => tree.depth === maxDepth);
    return this._reviewersForTrees(deepestTrees);
  }

  /** Part 2 **/

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
    const mostFilesOwned = Math.max(
      ...Object.values(reviewerFilesMap).map(files => files.length)
    );
    return Object.entries(reviewerFilesMap).filter(
      ([reviewer, files]) => files.length == mostFilesOwned
    );
  }

  /**
   * Picks the best reviewer-fileset pair to satisfy the deepest rules.
   *
   * @private
   * Chooses randomly from the set of best possible reviewers to allow even
   * distribution of reviews.
   *
   * @param {!FileTreeMap} fileTreeMap map from filenames to ownership subtrees.
   * @return {ReviewerFiles} tuple of a reviewer username and the files they
   *     own.
   */
  static _pickBestReview(fileTreeMap) {
    const reviewerSet = this._findPotentialReviewers(fileTreeMap);
    const reviewerFilesMap = {};
    reviewerSet.forEach(reviewer => {
      reviewerFilesMap[reviewer] = this._filesOwnedByReviewer(
        fileTreeMap,
        reviewer
      );
    });
    const bestReviewers = this._reviewersWithMostFiles(reviewerFilesMap);
    return bestReviewers[Math.floor(Math.random() * bestReviewers.length)];
  }

  /** Part 3 **/

  /**
   * Picks a set of reviews to approve the PR.
   *
   * @throws {Error} if the algorithm fails to select reviewers.
   * @param {!FileTreeMap} fileTreeMap map from filenames to ownership subtrees.
   * @return {ReviewerFiles[]} list of reviewers and the files they cover, in
   *     decreasing order of ownership depth.
   */
  static pickReviews(fileTreeMap) {
    const reviews = [];

    while (Object.entries(fileTreeMap).length) {
      const bestReview = this._pickBestReview(fileTreeMap);
      if (!bestReview) {
        // This should be impossible unless there is no top-level OWNERS file.
        throw Error('Could not select reviewers!');
      }

      const [bestReviewer, coveredFiles] = bestReview;
      reviews.push([bestReviewer, coveredFiles]);
      coveredFiles.forEach(filename => {
        delete fileTreeMap[filename];
      });
    }

    return reviews;
  }
}

module.exports = {ReviewerSelection};
