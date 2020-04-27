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

const {OWNER_MODIFIER} = require('./ownership/owner');
const ADD_REVIEWERS_TAG = /#add-?owners/i;
const DONT_ADD_REVIEWERS_TAG = /#no-?add-?owners/i;

/**
 * Notifier for to tagging and requesting reviewers for a PR.
 */
class OwnersNotifier {
  /**
   * Constructor.
   *
   * @param {!PullRequest} pr pull request to add notifications to.
   * @param {!ReviewerApprovalMap} currentReviewers current reviewer approvals.
   * @param {!OwnersTree} tree file ownership tree.
   * @param {!Array<string>} changedFiles list of change files.
   */
  constructor(pr, currentReviewers, tree, changedFiles) {
    Object.assign(this, {pr, currentReviewers});
    this.fileTreeMap = tree.buildFileTreeMap(changedFiles);
  }

  /**
   * Notify reviewers and owners about the PR.
   *
   * @param {!GitHub} github GitHub API interface.
   * @param {!Array<string>} suggestedReviewers suggested reviewers to add.
   */
  async notify(github, suggestedReviewers) {
    if (suggestedReviewers.length) {
      const requested = await this.requestReviews(github, suggestedReviewers);
      requested.forEach(reviewer => {
        this.currentReviewers[reviewer] = false;
      });
    }

    await this.createNotificationComment(github);
  }

  /**
   * Requests reviews from owners.
   *
   * Only requests reviews if the PR description contains the #addowners tag.
   *
   * @param {!GitHub} github GitHub API interface.
   * @param {!Array<string>} suggestedReviewers suggested reviewers to add.
   * @return {!Array<string>} list of reviewers requested.
   */
  async requestReviews(github, suggestedReviewers) {
    const optOut = process.env.ADD_REVIEWERS_OPT_OUT;
    const optOutTagPresent = DONT_ADD_REVIEWERS_TAG.test(this.pr.description);
    const optInTagPresent = ADD_REVIEWERS_TAG.test(this.pr.description);

    if ((optOut && !optOutTagPresent) || (!optOut && optInTagPresent)) {
      const reviewRequests = this.getReviewersToRequest(suggestedReviewers);
      await github.createReviewRequests(this.pr.number, reviewRequests);
      return reviewRequests;
    }

    return [];
  }

  /**
   * Adds a comment tagging always-notify owners of changed files.
   *
   * @param {!GitHub} github GitHub API interface.
   */
  async createNotificationComment(github) {
    let [botComment] = await github.getBotComments(this.pr.number);
    const notifies = this.getOwnersToNotify();
    delete notifies[this.pr.author];

    const fileNotifyComments = Object.entries(
      notifies
    ).map(([name, filenames]) =>
      [
        `Hey @${name}, these files were changed:`,
        '```',
        ...filenames,
        '```',
      ].join('\n')
    );

    if (!fileNotifyComments.length) {
      return;
    }

    const body = fileNotifyComments.join('\n\n');
    if (botComment) {
      await github.updateComment(botComment.id, body);
    } else {
      botComment = await github.createBotComment(this.pr.number, body);
    }

    // App-authenticated comments appear to come from the app user (ie.
    // `amp-owners-bot`) but can't tag teams. The workaround is doing a fake
    // update to the comment with a user-authenticated client, which enables the
    // @ mention but leaves the comment author as the app name.
    const teamNotifies = Object.keys(notifies).filter(n => n.includes('/'));
    if (teamNotifies.length) {
      await github.user.updateComment(
        botComment.id,
        `${body}\n<!-- Edited to fix team @ mention -->`
      );
    }
  }

  /**
   * Checks if a reviewer should be requested.
   *
   * If there is any file for which the reviewer is a non-silent owner, this
   * should be true.
   *
   * @param {string} reviewer reviewer username.
   * @return {boolean} if the reviewer is a non-silent owner of a changed file.
   */
  _shouldRequestReview(reviewer) {
    return Object.entries(this.fileTreeMap)
      .map(([filename, subtree]) => subtree.fileOwners(filename))
      .some(fileOwners => {
        for (const owner of fileOwners) {
          if (owner.includes(reviewer)) {
            return owner.modifier !== OWNER_MODIFIER.SILENT;
          }
        }
      });
  }

  /**
   * Determine the set of users to request reviews from.
   *
   * @param {!Array<string>} suggestedReviewers list of suggested reviewer usernames.
   * @return {!Array<string>} list of usernames.
   */
  getReviewersToRequest(suggestedReviewers) {
    return Array.from(new Set(suggestedReviewers)).filter(
      this._shouldRequestReview,
      this
    );
  }

  /**
   * Determine the set of owners to notify/tag for each file.
   *
   * @return {!Object<string, !Array<string>>} map owner names to filenames.
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

    Object.keys(this.currentReviewers).forEach(name => {
      delete notifies[name];
    });

    return notifies;
  }
}

module.exports = {OwnersNotifier};
