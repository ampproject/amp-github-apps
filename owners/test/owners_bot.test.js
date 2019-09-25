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
const {OwnersBot} = require('../src/owners_bot');
const {OwnersParser} = require('../src/parser');
const {OwnersNotifier} = require('../src/notifier');
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
    info: () => {},
    warn: () => {},
    error: () => {},
  };

  let sandbox;
  const github = new GitHub({}, 'ampproject', 'amphtml', silentLogger);
  const pr = new PullRequest(1337, 'the_author', '_test_hash_', 'description');
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

    it('fetches members for each team', async done => {
      await ownersBot.initTeams(github);

      sandbox.assert.calledWith(github.getTeamMembers, 1337);
      sandbox.assert.calledWith(github.getTeamMembers, 42);
      done();
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
      sandbox
        .stub(GitHub.prototype, 'getReviewRequests')
        .returns(['requested']);
    });

    it('parses the owners tree', async () => {
      expect.assertions(1);
      const {tree} = await ownersBot.initPr(github, pr);
      expect(tree).toBeInstanceOf(OwnersTree);
    });

    it('warns about parsing errors', async done => {
      const error = new Error('Oops!');
      sandbox.stub(silentLogger, 'warn');
      sandbox.stub(OwnersParser.prototype, 'parseOwnersTree').returns({
        tree: new OwnersTree(),
        errors: [error],
      });
      await ownersBot.initPr(github, pr);

      sandbox.assert.calledWith(silentLogger.warn, error);
      done();
    });

    it('finds the reviewers that approved', async () => {
      expect.assertions(2);
      const {reviewers} = await ownersBot.initPr(github, pr);

      expect(reviewers['approver']).toBe(true);
      expect(reviewers['other_approver']).toBe(true);
    });

    it('finds the requested reviewers', async () => {
      expect.assertions(1);
      const {reviewers} = await ownersBot.initPr(github, pr);

      expect(reviewers['requested']).toBe(false);
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
      sandbox.stub(GitHub.prototype, 'getReviewRequests').returns([]);
      sandbox.stub(GitHub.prototype, 'createReviewRequests');
      sandbox.stub(GitHub.prototype, 'getBotComments').returns([]);
      sandbox.stub(GitHub.prototype, 'createBotComment');
    });

    it('attempts to fetch the existing check-run ID', async done => {
      await ownersBot.runOwnersCheck(github, pr);

      sandbox.assert.calledWith(github.getCheckRunIds, '_test_hash_');
      done();
    });

    it('checks out the latest master', async done => {
      await ownersBot.runOwnersCheck(github, pr);

      sandbox.assert.calledOnce(localRepo.checkout);
      done();
    });

    it('runs the owners check', async done => {
      await ownersBot.runOwnersCheck(github, pr);

      sandbox.assert.calledOnce(OwnersCheck.prototype.run);
      done();
    });

    describe('when a check-run exists', () => {
      it('updates the existing check-run', async done => {
        getCheckRunIdsStub.returns({'owners-check': 42});
        await ownersBot.runOwnersCheck(github, pr);

        sandbox.assert.calledWith(
          GitHub.prototype.updateCheckRun,
          42,
          checkRun
        );
        done();
      });
    });

    describe('when no check-run exists yet', () => {
      it('creates a new check-run', async done => {
        await ownersBot.runOwnersCheck(github, pr);

        sandbox.assert.calledWith(
          GitHub.prototype.createCheckRun,
          '_test_hash_',
          checkRun
        );
        done();
      });
    });

    it('requests reviewers', async done => {
      sandbox.stub(OwnersNotifier.prototype, 'requestReviews');
      await ownersBot.runOwnersCheck(github, pr);

      sandbox.assert.calledWith(
        OwnersNotifier.prototype.requestReviews,
        github,
        ['root_owner']
      );
      done();
    });

    it('creates a notification comment', async done => {
      sandbox.stub(OwnersNotifier.prototype, 'createNotificationComment');
      await ownersBot.runOwnersCheck(github, pr);

      sandbox.assert.calledWith(
        OwnersNotifier.prototype.createNotificationComment,
        github
      );
      done();
    });
  });

  describe('runOwnersCheckOnPrNumber', () => {
    beforeEach(() => {
      sandbox.stub(OwnersBot.prototype, 'runOwnersCheck');
      sandbox.stub(GitHub.prototype, 'getPullRequest').returns(pr);
    });

    it('fetches the PR from GitHub', async done => {
      await ownersBot.runOwnersCheckOnPrNumber(github, 1337);

      sandbox.assert.calledWith(github.getPullRequest, 1337);
      done();
    });

    it('runs the owners check on the retrieved PR', async done => {
      await ownersBot.runOwnersCheckOnPrNumber(github, 1337);

      sandbox.assert.calledWith(ownersBot.runOwnersCheck, github, pr);
      done();
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
});
