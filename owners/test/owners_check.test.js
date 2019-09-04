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
const {PullRequest, Review} = require('../src/github');
const {LocalRepository} = require('../src/local_repo');
const {CheckRun, OwnersCheck} = require('../src/owners_check');
const {OwnersTree} = require('../src/owners');

describe('check run', () => {
  describe('json', () => {
    it('produces a JSON object in the GitHub API format', () => {
      const checkRun = new CheckRun('Test summary', 'Test text');
      const checkRunJson = checkRun.json;

      expect(checkRunJson.name).toEqual('ampproject/owners-check');
      expect(checkRunJson.status).toEqual('completed');
      expect(checkRunJson.conclusion).toEqual('neutral');
      expect(checkRunJson.output.title).toEqual('ampproject/owners-check');
      expect(checkRunJson.output.summary).toEqual('Test summary');
      expect(checkRunJson.output.text).toEqual('Test text');
    });
  });
});

describe('owners check', () => {
  /* eslint-disable require-jsdoc */
  class FakeGithub {
    constructor(reviews) {
      this.getReviews = () => reviews;
    }

    async listFiles() {
      return ['changed_file1.js', 'changed_file2.js'];
    }
  }
  /* eslint-enable require-jsdoc */

  const sandbox = sinon.createSandbox();
  const repo = new LocalRepository('path/to/repo');
  const pr = new PullRequest(35, 'the_author', '_test_hash_');

  const timestamp = '2019-01-01T00:00:00Z';
  const approval = new Review('approver', 'approved', timestamp);
  const authorApproval = new Review('the_author', 'approved', timestamp);
  const otherApproval = new Review('other_approver', 'approved', timestamp);
  const rejection = new Review('rejector', 'changes_requested', timestamp);

  beforeEach(() => {
    sandbox.stub(repo, 'checkout');
    sandbox.stub(repo, 'findOwnersFiles').returns([]);
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe('init', () => {
    const github = new FakeGithub([approval, otherApproval]);
    let ownersCheck;

    beforeEach(() => {
      ownersCheck = new OwnersCheck(repo, github, pr);
    });

    it('checks out the repo', async () => {
      await ownersCheck.init();
      sandbox.assert.calledOnce(repo.checkout);
    });

    it('parses the owners tree', async () => {
      await ownersCheck.init();
      expect(ownersCheck.tree).toBeInstanceOf(OwnersTree);
    });

    it('finds the reviewers that approved', async () => {
      await ownersCheck.init();
      expect(ownersCheck.approvers).toContain('approver', 'other_approver');
    });

    it('fetches the files changed in the PR', async () => {
      sandbox.stub(FakeGithub.prototype, 'listFiles').callThrough();
      await ownersCheck.init();

      sandbox.assert.calledWith(ownersCheck.github.listFiles, 35);
      expect(ownersCheck.changedFiles).toContain(
        'changed_file1.js',
        'changed_file2.js'
      );
    });

    it('sets `initialized` to true', async () => {
      expect(ownersCheck.initialized).toBe(false);
      await ownersCheck.init();
      expect(ownersCheck.initialized).toBe(true);
    });
  });

  describe('getApprovers', () => {
    it("returns the reviewers' usernames", async () => {
      const ownersCheck = new OwnersCheck(
        repo,
        new FakeGithub([approval, otherApproval]),
        pr
      );
      const approvers = await ownersCheck._getApprovers();

      expect(approvers).toContain('approver', 'other_approver');
    });

    it('includes the author', async () => {
      const ownersCheck = new OwnersCheck(repo, new FakeGithub([]), pr);
      const approvers = await ownersCheck._getApprovers();

      expect(approvers).toContain('the_author');
    });

    it('produces unique usernames', async () => {
      const ownersCheck = new OwnersCheck(
        repo,
        new FakeGithub([approval, approval, authorApproval]),
        pr
      );
      const approvers = await ownersCheck._getApprovers();

      expect(approvers).toEqual(['approver', 'the_author']);
    });

    it('includes only reviewers who approved the review', async () => {
      const ownersCheck = new OwnersCheck(
        repo,
        new FakeGithub([approval, rejection]),
        pr
      );
      const approvers = await ownersCheck._getApprovers();

      expect(approvers).not.toContain('rejector');
    });
  });
});
