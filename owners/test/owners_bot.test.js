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
const {GitHub, PullRequest, Review} = require('../src/github');
const {LocalRepository} = require('../src/local_repo');
const {OwnersBot} = require('../src/owners_bot');
const {OwnersParser} = require('../src/parser');
const {OwnersTree} = require('../src/owners_tree');
const {
  CheckRun,
  CheckRunConclusion,
  OwnersCheck,
} = require('../src/owners_check');

describe('owners bot', () => {
  let sandbox;
  const github = new GitHub({}, 'ampproject', 'amphtml', console);
  const pr = new PullRequest(1337, 'the_author', '_test_hash_');
  const localRepo = new LocalRepository('path/to/repo');
  const ownersBot = new OwnersBot(localRepo);

  const timestamp = '2019-01-01T00:00:00Z';
  const approval = new Review('approver', 'approved', timestamp);
  const authorApproval = new Review('the_author', 'approved', timestamp);
  const otherApproval = new Review('other_approver', 'approved', timestamp);
  const rejection = new Review('rejector', 'changes_requested', timestamp);

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    sandbox.stub(LocalRepository.prototype, 'checkout');
    sandbox.stub(LocalRepository.prototype, 'findOwnersFiles').returns([]);
    ownersBot.GITHUB_CHECKRUN_DELAY = 0;
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe('initPr', () => {
    beforeEach(() => {
      sandbox
        .stub(GitHub.prototype, 'getReviews')
        .returns([approval, otherApproval]);
      sandbox
        .stub(GitHub.prototype, 'listFiles')
        .returns(['changed_file1.js', 'foo/changed_file2.js']);
    });

    it('parses the owners tree', async () => {
      expect.assertions(1);
      const {tree} = await ownersBot.initPr(github, pr);
      expect(tree).toBeInstanceOf(OwnersTree);
    });

    it('warns about parsing errors', async () => {
      expect.assertions(1);
      const error = new Error('Oops!');
      sandbox.stub(console, 'warn');
      sandbox.stub(OwnersParser.prototype, 'parseOwnersTree').returns({
        tree: new OwnersTree(),
        errors: [error],
      });
      await ownersBot.initPr(github, pr);

      sandbox.assert.calledWith(console.warn, error);

      // Ensures the test fails if the assertion is never run.
      expect(true).toBe(true);
    });

    it('finds the reviewers that approved', async () => {
      expect.assertions(1);
      const {approvers} = await ownersBot.initPr(github, pr);
      expect(approvers).toContain('approver', 'other_approver');
    });

    it('fetches the files changed in the PR', async () => {
      expect.assertions(1);
      const {changedFiles} = await ownersBot.initPr(github, pr);

      sandbox.assert.calledWith(github.listFiles, 1337);
      expect(changedFiles).toContain(
        'changed_file1.js',
        'foo/changed_file2.js'
      );
    });
  });

  describe('runOwnersCheck', () => {
    const checkRun = new CheckRun(
      CheckRunConclusion.SUCCESS,
      'Success!',
      'The owners check passed.'
    );
    let getCheckRunIdStub;

    beforeEach(() => {
      getCheckRunIdStub = sandbox.stub(GitHub.prototype, 'getCheckRunId');
      sandbox.stub(OwnersCheck.prototype, 'run').returns(checkRun);
      sandbox.stub(GitHub.prototype, 'updateCheckRun');
      sandbox.stub(GitHub.prototype, 'createCheckRun');
      sandbox.stub(GitHub.prototype, 'getReviews').returns([]);
      sandbox.stub(GitHub.prototype, 'listFiles').returns([]);
    });

    it('attempts to fetch the existing check-run ID', async () => {
      expect.assertions(1);
      await ownersBot.runOwnersCheck(github, pr);
      sandbox.assert.calledWith(github.getCheckRunId, '_test_hash_');

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
        getCheckRunIdStub.returns(42);
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
        getCheckRunIdStub.returns(null);
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

  describe('getApprovers', () => {
    it("returns the reviewers' usernames", async () => {
      expect.assertions(1);
      sandbox
        .stub(GitHub.prototype, 'getReviews')
        .returns([approval, otherApproval]);
      const approvers = await ownersBot._getApprovers(github, pr);

      expect(approvers).toContain('approver', 'other_approver');
    });

    it('includes the author', async () => {
      expect.assertions(1);
      sandbox.stub(GitHub.prototype, 'getReviews').returns([]);
      const approvers = await ownersBot._getApprovers(github, pr);

      expect(approvers).toContain('the_author');
    });

    it('produces unique usernames', async () => {
      expect.assertions(1);
      sandbox
        .stub(GitHub.prototype, 'getReviews')
        .returns([approval, approval, authorApproval]);
      const approvers = await ownersBot._getApprovers(github, pr);

      expect(approvers).toEqual(['approver', 'the_author']);
    });

    it('includes only reviewers who approved the review', async () => {
      expect.assertions(1);
      sandbox
        .stub(GitHub.prototype, 'getReviews')
        .returns([approval, rejection]);
      const approvers = await ownersBot._getApprovers(github, pr);

      expect(approvers).not.toContain('rejector');
    });
  });
});
