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

 const {OWNER_MODIFIER} = require('./owner')

/**
 * Notifier for to tagging and requesting reviewers for a PR.
 */
class OwnersNotifier {
  /**
   * Constructor.
   *
   * @param {!FileTreeMap} fileTreeMap map from filenames to ownership subtrees.
   */
  constructor(fileTreeMap) {
    Object.assign(this, {fileTreeMap});
  }

  /**
   * Determine the set of users to request reviews from.
   *
   * @param {string[]} suggestedReviewers list of suggested reviewer usernames.
   * @return {string[]} list of usernames.
   */
  getReviewersToRequest(suggestedReviewers) {
    const reviewers = new Set(suggestedReviewers);
    Object.entries(this.fileTreeMap).forEach(([filename, subtree]) => {
      subtree
        .getModifiedFileOwners(filename, OWNER_MODIFIER.SILENT)
        .map(owner => owner.allUsernames)
        .reduce((left, right) => left.concat(right), [])
        .forEach(reviewers.delete, reviewers);
    });

    return Array.from(reviewers);
  }

  /**
   * Determine the set of owners to notify/tag for each file.
   *
   * @return {Object<string, string[]>} map from user/team names to filenames.
   */
  getOwnersToNotify() {
    const notifies = {};
    Object.entries(this.fileTreeMap).forEach(([filename, subtree]) => {
      subtree
        .getModifiedFileOwners(filename, OWNER_MODIFIER.NOTIFY)
        .map(owner => owner.name)
        .forEach(name => {
          if (!notifies[name]) {
            notifies[name] = [];
          }
          notifies[name].push(filename);
        });
    });

    return notifies;
  }
}

module.exports = {OwnersNotifier};
