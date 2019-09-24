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
const {GitHub, PullRequest, Team} = require('../src/github');
const {OwnersTree} = require('../src/owners_tree');
const {OwnersRule} = require('../src/rules');
const {UserOwner, TeamOwner, OWNER_MODIFIER} = require('../src/owner');
const {OwnersNotifier} = require('../src/notifier');

describe('notifier', () => {
  const sandbox = sinon.createSandbox();
  const loggerStub = sinon.stub();
  const github = new GitHub(
    sinon.stub(),
    'ampproject',
    'amphtml',
    loggerStub,
  );
  const pr = new PullRequest(1337, 'the_author', '_test_hash_', 'description');

  afterEach(() => {
    sandbox.restore();
  });

  describe('createNotificationComment', () => {
    let getCommentsStub;
    let notifier;

    beforeEach(() => {
      sandbox.stub(GitHub.prototype, 'createBotComment');
      sandbox.stub(GitHub.prototype, 'updateComment').returns();
      getCommentsStub = sandbox.stub(GitHub.prototype, 'getBotComments');
      getCommentsStub.returns([]);

      notifier = new OwnersNotifier(pr, new OwnersTree(), [{
        filename: 'main.js',
        sha: '_sha_',
      }]);
    });

    it('gets users and teams to notify', async done => {
      sandbox.stub(OwnersNotifier.prototype, 'getOwnersToNotify').returns([]);
      await notifier.createNotificationComment(github);

      sandbox.assert.calledOnce(notifier.getOwnersToNotify);
      done();
    });

    describe('when there are users or teams to notify', () => {
      beforeEach(() => {
        sandbox.stub(OwnersNotifier.prototype, 'getOwnersToNotify').returns({
          'a_subscriber': ['foo/main.js'],
          'ampproject/some_team': ['foo/main.js'],
        });
      });

      describe('when a comment by the bot already exists', () => {
        beforeEach(() => {
          getCommentsStub.returns([{id: 42, body: 'a comment'}]);
        });

        it('does not create a comment', async done => {
          await notifier.createNotificationComment(github);

          sandbox.assert.notCalled(github.createBotComment);
          done();
        });

        it('updates the existing comment', async () => {
          expect.assertions(2);
          await notifier.createNotificationComment(github);

          sandbox.assert.calledOnce(github.updateComment);
          const [commentId, comment] = github.updateComment.getCall(0).args;
          expect(commentId).toEqual(42);
          expect(comment).toContain(
            'Hey @a_subscriber, these files were changed:\n- foo/main.js',
            'Hey @ampproject/some_team, these files were changed:\n- foo/main.js'
          );
        });
      });

      describe('when no comment by the bot exists yet', () => {
        it('creates a comment tagging users and teams', async () => {
          expect.assertions(2);
          await notifier.createNotificationComment(github);

          sandbox.assert.calledOnce(github.createBotComment);
          const [prNumber, comment] = github.createBotComment.getCall(0).args;
          expect(prNumber).toEqual(1337);
          expect(comment).toContain(
            'Hey @a_subscriber, these files were changed:\n- foo/main.js',
            'Hey @ampproject/some_team, these files were changed:\n- foo/main.js'
          );
        });
      });
    });

    describe('when there are no users or teams to notify', () => {
      it('does not create or update a comment', async done => {
        await notifier.createNotificationComment(github);

        sandbox.assert.notCalled(github.createBotComment);
        sandbox.assert.notCalled(github.updateComment);
        done();
      });
    });
  });

  describe('getReviewersToRequest', () => {
    let tree;
    const busyTeam = new Team(42, 'ampproject', 'busy_team');
    busyTeam.members = ['busy_member'];
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

      notifier = new OwnersNotifier(pr, tree, [{
        filename: 'foo/script.js',
        sha: '_sha_',
      }]);
    });

    it('includes suggested reviewers', () => {
      const reviewRequests = notifier.getReviewersToRequest(['auser']);
      expect(reviewRequests).toContain('auser');
    });

    it('excludes user owners with the no-notify modifier', () => {
      const reviewRequests = notifier.getReviewersToRequest(['busy_user']);
      expect(reviewRequests).not.toContain('busy_user');
    });

    it('excludes members of team owners with the no-notify modifier', () => {
      const reviewRequests = notifier.getReviewersToRequest(['busy_member']);
      expect(reviewRequests).not.toContain('busy_member');
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
      const notifier = new OwnersNotifier(pr, tree, [
        {filename: 'foo/main.js', sha: '_sha_'},
        {filename: 'foo/bar.js', sha: '_sha_'},
      ]);
      const notifies = notifier.getOwnersToNotify();

      expect(notifies['relevant_user']).toContain('foo/main.js');
    });

    it('includes team owners with the always-notify modifier', () => {
      const notifier = new OwnersNotifier(pr, tree, [{
        filename: 'bar/script.js',
        sha: '_sha_',
      }]);
      const notifies = notifier.getOwnersToNotify();

      expect(notifies['ampproject/relevant_team']).toContain('bar/script.js');
    });

    it('excludes files with no always-notify owners', () => {
      const notifier = new OwnersNotifier(pr, tree, [{
        filename: 'baz/test.js',
        sha: '_sha_',
      }]);
      const notifies = notifier.getOwnersToNotify();

      expect(notifies['rando']).toBeUndefined();
    });
  });
});
