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
const {GitHub, PullRequest, Review, Team} = require('../src/github');
const {LocalRepository} = require('../src/local_repo');
const {UserOwner, TeamOwner, OWNER_MODIFIER} = require('../src/owner');
const {OwnersBot} = require('../src/owners_bot');
const {OwnersRule} = require('../src/rules');
const {OwnersParser} = require('../src/parser');
const {OwnersTree} = require('../src/owners_tree');
const {
  CheckRun,
  CheckRunConclusion,
  OwnersCheck,
} = require('../src/owners_check');

describe('owners bot', () => {
  const silentLogger = {
    debug: () => {},
    log: () => {},
    warn: () => {},
    error: () => {},
  };

  let sandbox;
  const github = new GitHub({}, 'ampproject', 'amphtml', silentLogger);
  const pr = new PullRequest(1337, 'the_author', '_test_hash_', 'descrption');
  const localRepo = new LocalRepository('path/to/repo');
  const ownersBot = new OwnersBot(localRepo);

  const timestamp = '2019-01-01T00:00:00Z';
  const approval = new Review('approver', 'approved', timestamp);
  const otherApproval = new Review('other_approver', 'approved', timestamp);
  const rejection = new Review('rejector', 'changes_requested', timestamp);

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    sandbox.stub(LocalRepository.prototype, 'checkout');
    sandbox.stub(LocalRepository.prototype, 'findOwnersFiles').returns([]);
    ownersBot.GITHUB_CHECKRUN_DELAY = 0;
    ownersBot.GITHUB_GET_MEMBERS_DELAY = 0;
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe('initTeams', () => {
    let myTeam;
    let otherTeam;

    beforeEach(() => {
      myTeam = new Team(1337, 'ampproject', 'my_team');
      otherTeam = new Team(42, 'ampproject', 'other_team');
      sandbox.stub(GitHub.prototype, 'getTeams').returns([myTeam, otherTeam]);
      sandbox.stub(GitHub.prototype, 'getTeamMembers').returns([]);
    });

    it('builds a map of teams from GitHub', async () => {
      expect.assertions(2);
      await ownersBot.initTeams(github);

      sandbox.assert.calledOnce(github.getTeams);
      expect(ownersBot.teams['ampproject/my_team']).toBe(myTeam);
      expect(ownersBot.teams['ampproject/other_team']).toBe(otherTeam);
    });

    it('fetches members for each team', async () => {
      expect.assertions(1);
      await ownersBot.initTeams(github);

      sandbox.assert.calledWith(github.getTeamMembers, 1337);
      sandbox.assert.calledWith(github.getTeamMembers, 42);
      // Ensures the test fails if the assertion is never run.
      expect(true).toBe(true);
    });
  });

  describe('initPr', () => {
    beforeEach(() => {
      sandbox
        .stub(GitHub.prototype, 'getReviews')
        .returns([approval, otherApproval]);
      sandbox
        .stub(GitHub.prototype, 'listFiles')
        .returns([
          {filename: 'changed_file1.js', sha: '_sha1_'},
          {filename: 'foo/changed_file2.js', sha: '_sha2_'},
        ]);
    });

    it('parses the owners tree', async () => {
      expect.assertions(1);
      const {tree} = await ownersBot.initPr(github, pr);
      expect(tree).toBeInstanceOf(OwnersTree);
    });

    it('warns about parsing errors', async () => {
      expect.assertions(1);
      const error = new Error('Oops!');
      sandbox.stub(silentLogger, 'warn');
      sandbox.stub(OwnersParser.prototype, 'parseOwnersTree').returns({
        tree: new OwnersTree(),
        errors: [error],
      });
      await ownersBot.initPr(github, pr);

      sandbox.assert.calledWith(silentLogger.warn, error);
      // Ensures the test fails if the assertion is never run.
      expect(true).toBe(true);
    });

    it('finds the reviewers that approved', async () => {
      expect.assertions(2);
      const {reviewers} = await ownersBot.initPr(github, pr);

      expect(reviewers['approver']).toBe(true);
      expect(reviewers['other_approver']).toBe(true);
    });

    it('fetches the files changed in the PR', async () => {
      expect.assertions(1);
      const {changedFiles} = await ownersBot.initPr(github, pr);

      sandbox.assert.calledWith(github.listFiles, 1337);
      expect(changedFiles).toContainEqual(
        {filename: 'changed_file1.js', sha: '_sha1_'},
        {filename: 'foo/changed_file2.js', sha: '_sha2_'}
      );
    });
  });

  describe('runOwnersCheck', () => {
    const checkRun = new CheckRun(
      CheckRunConclusion.SUCCESS,
      'Success!',
      'The owners check passed.'
    );
    let getCheckRunIdsStub;

    beforeEach(() => {
      getCheckRunIdsStub = sandbox.stub(GitHub.prototype, 'getCheckRunIds');
      getCheckRunIdsStub.returns({});
      sandbox.stub(OwnersCheck.prototype, 'run').returns({
        checkRun,
        reviewers: ['root_owner'],
      });
      sandbox.stub(GitHub.prototype, 'updateCheckRun');
      sandbox.stub(GitHub.prototype, 'createCheckRun');
      sandbox.stub(GitHub.prototype, 'getReviews').returns([]);
      sandbox.stub(GitHub.prototype, 'listFiles').returns([]);
      sandbox.stub(GitHub.prototype, 'createReviewRequests');
      sandbox.stub(GitHub.prototype, 'getBotComments').returns([]);
      sandbox.stub(GitHub.prototype, 'createBotComment');
    });

    it('attempts to fetch the existing check-run ID', async () => {
      expect.assertions(1);
      await ownersBot.runOwnersCheck(github, pr);

      sandbox.assert.calledWith(github.getCheckRunIds, '_test_hash_');
      // Ensures the test fails if the assertion is never run.
      expect(true).toBe(true);
    });

    it('checks out the latest master', async () => {
      expect.assertions(1);
      await ownersBot.runOwnersCheck(github, pr);

      sandbox.assert.calledOnce(localRepo.checkout);
      // Ensures the test fails if the assertion is never run.
      expect(true).toBe(true);
    });

    it('runs the owners check', async () => {
      expect.assertions(1);
      await ownersBot.runOwnersCheck(github, pr);

      sandbox.assert.calledOnce(OwnersCheck.prototype.run);
      // Ensures the test fails if the assertion is never run.
      expect(true).toBe(true);
    });

    describe('when a check-run exists', () => {
      it('updates the existing check-run', async () => {
        expect.assertions(1);
        getCheckRunIdsStub.returns({'owners-check': 42});
        await ownersBot.runOwnersCheck(github, pr);

        sandbox.assert.calledWith(
          GitHub.prototype.updateCheckRun,
          42,
          checkRun
        );
        // Ensures the test fails if the assertion is never run.
        expect(true).toBe(true);
      });
    });

    describe('when no check-run exists yet', () => {
      it('creates a new check-run', async () => {
        expect.assertions(1);
        await ownersBot.runOwnersCheck(github, pr);

        sandbox.assert.calledWith(
          GitHub.prototype.createCheckRun,
          '_test_hash_',
          checkRun
        );
        // Ensures the test fails if the assertion is never run.
        expect(true).toBe(true);
      });
    });

    it('does not create review requests', async done => {
      await ownersBot.runOwnersCheck(github, pr);

      sandbox.assert.notCalled(github.createReviewRequests);
      done();
    });

    describe('when the PR description contains #addowners', () => {
      beforeEach(() => {
        pr.description = 'Assign reviewers please #addowners';
      });

      it('requests reviewers', async done => {
        sandbox
          .stub(OwnersBot.prototype, '_getReviewRequests')
          .returns(['auser', 'anotheruser']);
        await ownersBot.runOwnersCheck(github, pr);

        sandbox.assert.calledWith(github.createReviewRequests, 1337, [
          'auser',
          'anotheruser',
        ]);
        done();
      });
    });

    it('creates a notification comment', async done => {
      sandbox.stub(OwnersBot.prototype, 'createNotifications');
      await ownersBot.runOwnersCheck(github, pr);

      sandbox.assert.calledOnce(ownersBot.createNotifications);
      done();
    });
  });

  describe('runOwnersCheckOnPrNumber', () => {
    beforeEach(() => {
      sandbox.stub(OwnersBot.prototype, 'runOwnersCheck');
      sandbox.stub(GitHub.prototype, 'getPullRequest').returns(pr);
    });

    it('fetches the PR from GitHub', async () => {
      expect.assertions(1);
      await ownersBot.runOwnersCheckOnPrNumber(github, 1337);

      sandbox.assert.calledWith(github.getPullRequest, 1337);
      // Ensures the test fails if the assertion is never run.
      expect(true).toBe(true);
    });

    it('runs the owners check on the retrieved PR', async () => {
      expect.assertions(1);
      await ownersBot.runOwnersCheckOnPrNumber(github, 1337);

      sandbox.assert.calledWith(ownersBot.runOwnersCheck, github, pr);
      // Ensures the test fails if the assertion is never run.
      expect(true).toBe(true);
    });
  });

  describe('createNotifications', () => {
    const fileTreeMap = {'main.js': new OwnersTree()};

    beforeEach(() => {
      sandbox.stub(GitHub.prototype, 'createBotComment');
    });

    describe('when a comment by the bot already exists', () => {
      beforeEach(() => {
        sandbox.stub(GitHub.prototype, 'getBotComments').returns(['a comment']);
      });

      it('does not create a comment', async done => {
        await ownersBot.createNotifications(github, 1337, fileTreeMap);

        sandbox.assert.notCalled(github.createBotComment);
        done();
      });
    });

    describe('when no comment by the bot exists yet', () => {
      beforeEach(() => {
        sandbox.stub(GitHub.prototype, 'getBotComments').returns([]);
      });

      it('gets users and teams to notify', async done => {
        sandbox.stub(OwnersBot.prototype, '_getNotifies').returns([]);
        await ownersBot.createNotifications(github, 1337, fileTreeMap);

        sandbox.assert.calledWith(ownersBot._getNotifies, fileTreeMap);
        done();
      });

      describe('when there are users or teams to notify', () => {
        beforeEach(() => {
          sandbox.stub(OwnersBot.prototype, '_getNotifies').returns({
            'a_subscriber': ['foo/main.js'],
            'ampproject/some_team': ['foo/main.js'],
          });
        });

        it('creates a comment tagging users and teams', async () => {
          expect.assertions(2);
          await ownersBot.createNotifications(github, 1337, fileTreeMap);

          sandbox.assert.calledOnce(github.createBotComment);
          const [prNumber, comment] = github.createBotComment.getCall(0).args;
          expect(prNumber).toEqual(1337);
          expect(comment).toContain(
            'Hey @a_subscriber, these files were changed:\n- foo/main.js',
            'Hey @ampproject/some_team, these files were changed:\n- foo/main.js'
          );
        });
      });

      describe('when there are no users or teams to notify', () => {
        it('does not create a comment', async done => {
          await ownersBot.createNotifications(github, 1337, fileTreeMap);

          sandbox.assert.notCalled(github.createBotComment);
          done();
        });
      });
    });
  });

  describe('getCurrentReviewers', () => {
    it("includes true for approvers' usernames", async () => {
      expect.assertions(2);
      sandbox
        .stub(GitHub.prototype, 'getReviews')
        .returns([approval, otherApproval]);
      const reviewers = await ownersBot._getCurrentReviewers(github, pr);

      expect(reviewers['approver']).toBe(true);
      expect(reviewers['other_approver']).toBe(true);
    });

    it('includes true for the author', async () => {
      expect.assertions(1);
      sandbox.stub(GitHub.prototype, 'getReviews').returns([]);
      const reviewers = await ownersBot._getCurrentReviewers(github, pr);

      expect(reviewers['the_author']).toBe(true);
    });

    it('includes false for reviewers who rejected the review', async () => {
      expect.assertions(1);
      sandbox
        .stub(GitHub.prototype, 'getReviews')
        .returns([approval, rejection]);
      const reviewers = await ownersBot._getCurrentReviewers(github, pr);

      expect(reviewers['rejector']).toBe(false);
    });
  });

  describe('getReviewRequests', () => {
    const tree = new OwnersTree();
    const busyTeam = new Team(42, 'ampproject', 'busy_team');
    busyTeam.members = ['busy_member'];
    let fileTreeMap;

    beforeEach(() => {
      sandbox
        .stub(OwnersTree.prototype, 'getModifiedFileOwners')
        .withArgs(sinon.match.string, OWNER_MODIFIER.SILENT)
        .returns([new UserOwner('busy_user'), new TeamOwner(busyTeam)]);

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
    });

    it('includes suggested reviewers', () => {
      const reviewRequests = ownersBot._getReviewRequests(fileTreeMap, [
        'auser',
      ]);

      expect(Array.from(reviewRequests)).toContain('auser');
    });

    it('excludes user owners with the no-notify modifier', () => {
      const reviewRequests = ownersBot._getReviewRequests(fileTreeMap, [
        'busy_user',
      ]);

      expect(Array.from(reviewRequests)).not.toContain('busy_user');
    });

    it('excludes members of team owners with the no-notify modifier', () => {
      const reviewRequests = ownersBot._getReviewRequests(fileTreeMap, [
        'busy_member',
      ]);

      expect(Array.from(reviewRequests)).not.toContain('busy_member');
    });
  });

  describe('getNotifies', () => {
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
      const fileTreeMap = tree.buildFileTreeMap(['foo/main.js']);
      const notifies = ownersBot._getNotifies(fileTreeMap);

      expect(notifies['relevant_user']).toContain('foo/main.js');
    });

    it('includes team owners with the always-notify modifier', () => {
      const fileTreeMap = tree.buildFileTreeMap(['bar/script.js']);
      const notifies = ownersBot._getNotifies(fileTreeMap);

      expect(notifies['ampproject/relevant_team']).toContain('bar/script.js');
    });

    it('excludes files with no always-notify owners', () => {
      const fileTreeMap = tree.buildFileTreeMap(['baz/test.js']);
      const notifies = ownersBot._getNotifies(fileTreeMap);

      expect(notifies['rando']).toBeUndefined();
    });
  });
});
