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
const {Team} = require('../src/github');
const {OwnersTree} = require('../src/owners_tree');
const {OwnersRule} = require('../src/rules');
const {UserOwner, TeamOwner, OWNER_MODIFIER} = require('../src/owner');
const {OwnersNotifier} = require('../src/notifier');

describe('notifier', () => {
  const sandbox = sinon.createSandbox();
  afterEach(() => {
    sandbox.restore();
  });

  describe('getReviewersToRequest', () => {
    let tree;
    const busyTeam = new Team(42, 'ampproject', 'busy_team');
    busyTeam.members = ['busy_member'];
    let fileTreeMap;
    let notifier;

    beforeEach(() => {
      sandbox
        .stub(OwnersTree.prototype, 'getModifiedFileOwners')
        .withArgs(sinon.match.string, OWNER_MODIFIER.SILENT)
        .returns([new UserOwner('busy_user'), new TeamOwner(busyTeam)]);

      tree = new OwnersTree()
      tree.addRule(
        new OwnersRule('foo/OWNERS.yaml', [
          new UserOwner('busy_user', OWNER_MODIFIER.SILENT),
        ])
      );
      tree.addRule(
        new OwnersRule('foo/OWNERS.yaml', [
          new TeamOwner(busyTeam, OWNER_MODIFIER.SILENT),
        ])
      );

      fileTreeMap = tree.buildFileTreeMap(['foo/script.js']);
      notifier = new OwnersNotifier(fileTreeMap);
    });

    it('includes suggested reviewers', () => {
      const reviewRequests = notifier.getReviewersToRequest(['auser']);
      expect(Array.from(reviewRequests)).toContain('auser');
    });

    it('excludes user owners with the no-notify modifier', () => {
      const reviewRequests = notifier.getReviewersToRequest(['busy_user']);
      expect(Array.from(reviewRequests)).not.toContain('busy_user');
    });

    it('excludes members of team owners with the no-notify modifier', () => {
      const reviewRequests = notifier.getReviewersToRequest(['busy_member']);
      expect(Array.from(reviewRequests)).not.toContain('busy_member');
    });
  });

  describe('getOwnersToNotify', () => {
    const tree = new OwnersTree();
    const relevantTeam = new Team(42, 'ampproject', 'relevant_team');
    relevantTeam.members = ['relevant_member'];
    tree.addRule(
      new OwnersRule('foo/OWNERS.yaml', [
        new UserOwner('relevant_user', OWNER_MODIFIER.NOTIFY),
      ])
    );
    tree.addRule(
      new OwnersRule('bar/OWNERS.yaml', [
        new TeamOwner(relevantTeam, OWNER_MODIFIER.NOTIFY),
      ])
    );
    tree.addRule(new OwnersRule('baz/OWNERS.yaml', [new UserOwner('rando')]));

    it('includes user owners with the always-notify modifier', () => {
      const fileTreeMap = tree.buildFileTreeMap(['foo/main.js', 'foo/bar.js']);
      const notifier = new OwnersNotifier(fileTreeMap);
      const notifies = notifier.getOwnersToNotify(fileTree);

      expect(notifies['relevant_user']).toContain('foo/main.js');
    });

    it('includes team owners with the always-notify modifier', () => {
      const fileTreeMap = tree.buildFileTreeMap(['bar/script.js']);
      const notifier = new OwnersNotifier(fileTreeMap);
      const notifies = notifier.getOwnersToNotify(fileTree);

      expect(notifies['ampproject/relevant_team']).toContain('bar/script.js');
    });

    it('excludes files with no always-notify owners', () => {
      const fileTreeMap = tree.buildFileTreeMap(['baz/test.js']);
      const notifier = new OwnersNotifier(fileTreeMap);
      const notifies = notifier.getOwnersToNotify(fileTree);

      expect(notifies['rando']).toBeUndefined();
    });
  });
});
