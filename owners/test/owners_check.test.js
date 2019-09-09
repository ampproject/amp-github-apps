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
const {
  CheckRun,
  CheckRunConclusion,
  OwnersCheck,
} = require('../src/owners_check');
const {OwnersTree} = require('../src/owners_tree');
const {OwnersRule} = require('../src/rules');
const {ReviewerSelection} = require('../src/reviewer_selection');

describe('check run', () => {
  describe('json', () => {
    it('produces a JSON object in the GitHub API format', () => {
      const checkRun = new CheckRun(
        CheckRunConclusion.NEUTRAL,
        'Test summary',
        'Test text'
      );
      const checkRunJson = checkRun.json;

      expect(checkRunJson.name).toEqual('ampproject/owners-check');
      expect(checkRunJson.status).toEqual('completed');
      expect(checkRunJson.conclusion).toEqual('neutral');
      expect(checkRunJson.output.title).toEqual('Test summary');
      expect(checkRunJson.output.summary).toEqual('Test summary');
      expect(checkRunJson.output.text).toEqual('Test text');
    });
  });
});

describe('owners check', () => {
  /* eslint-disable require-jsdoc */
  class FakeGithub {
    constructor(reviews, files) {
      this.getReviews = () => reviews;
      this.listFiles = async () => files;
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
    const github = new FakeGithub(
      [approval, otherApproval],
      ['changed_file1.js', 'foo/changed_file2.js']
    );
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
      sandbox.stub(github, 'listFiles').callThrough();
      await ownersCheck.init();

      sandbox.assert.calledWith(ownersCheck.github.listFiles, 35);
      expect(ownersCheck.changedFiles).toContain(
        'changed_file1.js',
        'foo/changed_file2.js'
      );
    });

    it('sets `initialized` to true', async () => {
      expect(ownersCheck.initialized).toBe(false);
      await ownersCheck.init();
      expect(ownersCheck.initialized).toBe(true);
    });
  });

  describe('run', () => {
    const github = new FakeGithub(
      [approval, otherApproval],
      [
        'main.js', // root_owner
        'foo/test.js', // approver, some_user, root_owner
        'bar/baz/file.txt', // other_approver, root_owner
        'buzz/README.md', // root_owner
      ]
    );
    let ownersCheck;

    beforeEach(() => {
      ownersCheck = new OwnersCheck(repo, github, pr);
      sandbox.stub(ownersCheck.parser, 'parseAllOwnersRules').returns({
        rules: [
          new OwnersRule('OWNERS.yaml', ['root_owner']),
          new OwnersRule('foo/OWNERS.yaml', ['approver', 'some_user']),
          new OwnersRule('bar/OWNERS.yaml', ['other_approver']),
        ],
      });
    });

    it('calls `init` if not initialized', async () => {
      sandbox.stub(OwnersCheck.prototype, 'init').callThrough();
      await ownersCheck.run();

      sandbox.assert.calledOnce(ownersCheck.init);
    });

    it('does not call `init` if already initialized', async () => {
      await ownersCheck.init();
      sandbox.stub(OwnersCheck.prototype, 'init').callThrough();
      await ownersCheck.run();

      sandbox.assert.notCalled(ownersCheck.init);
    });

    it('builds a map of changed files and their ownership trees', async () => {
      sandbox.stub(OwnersTree.prototype, 'buildFileTreeMap').callThrough();
      await ownersCheck.run();

      sandbox.assert.calledWith(ownersCheck.tree.buildFileTreeMap, [
        'main.js',
        'foo/test.js',
        'bar/baz/file.txt',
        'buzz/README.md',
      ]);
    });

    describe('created check-run', () => {
      it('contains coverage information in the output', async () => {
        sandbox
          .stub(OwnersCheck.prototype, 'buildCurrentCoverageText')
          .returns('%% COVERAGE INFO %%');
        const checkRun = await ownersCheck.run();

        expect(checkRun.text).toContain('%% COVERAGE INFO %%');
      });

      describe('for a fully-approved PR', () => {
        beforeEach(() => {
          sandbox.stub(OwnersTree.prototype, 'fileHasOwner').returns(true);
        });

        it('has a success conclusion', async () => {
          const checkRun = await ownersCheck.run();

          expect(checkRun.json.conclusion).toEqual('success');
        });

        it('has a passing summary', async () => {
          const checkRun = await ownersCheck.run();

          expect(checkRun.summary).toEqual(
            'All files in this PR have OWNERS approval'
          );
        });

        it('does not run reviewer selection', async () => {
          sandbox.stub(ReviewerSelection, 'pickReviews');
          await ownersCheck.run();

          sandbox.assert.notCalled(ReviewerSelection.pickReviews);
        });

        it('does output review suggestions', async () => {
          sandbox.stub(OwnersCheck.prototype, 'buildReviewSuggestionsText');
          await ownersCheck.run();

          sandbox.assert.notCalled(ownersCheck.buildReviewSuggestionsText);
        });
      });

      describe('for a PR requiring approvals', () => {
        // TODO(rcebulko): Update once this is changed to a blocking check.
        it('has a neutral conclusion', async () => {
          const checkRun = await ownersCheck.run();

          expect(checkRun.json.conclusion).toEqual('neutral');
        });

        it('has a failing summary', async () => {
          const checkRun = await ownersCheck.run();

          expect(checkRun.summary).toEqual(
            'Missing required OWNERS approvals! Suggested reviewers: root_owner'
          );
        });

        it('runs reviewer selection', async () => {
          sandbox.stub(ReviewerSelection, 'pickReviews').callThrough();
          await ownersCheck.run();

          sandbox.assert.calledOnce(ReviewerSelection.pickReviews);
        });

        it('contains review suggestions in the output', async () => {
          sandbox
            .stub(OwnersCheck.prototype, 'buildReviewSuggestionsText')
            .returns('%% REVIEW SUGGESTIONS %%');
          const checkRun = await ownersCheck.run();

          expect(checkRun.text).toContain('%% REVIEW SUGGESTIONS %%');
        });
      });

      describe('if an error occurs', () => {
        beforeEach(() => {
          sandbox
            .stub(OwnersCheck.prototype, 'buildCurrentCoverageText')
            .throws(new Error('Something is wrong'));
        });

        // TODO(rcebulko): Update once this is changed to a blocking check.
        it('has a neutral conclusion', async () => {
          const checkRun = await ownersCheck.run();

          expect(checkRun.json.conclusion).toEqual('neutral');
        });

        it('has an error summary', async () => {
          const checkRun = await ownersCheck.run();

          expect(checkRun.summary).toEqual('The check encountered an error!');
        });

        it('contains error details in the output', async () => {
          const checkRun = await ownersCheck.run();

          expect(checkRun.text).toEqual(
            'OWNERS check encountered an error:\nError: Something is wrong'
          );
        });
      });
    });
  });

  describe('hasOwnersApproval', () => {
    const github = new FakeGithub(
      [approval, otherApproval],
      [
        'main.js', // root_owner
        'foo/test.js', // approver, some_user, root_owner
        'bar/baz/file.txt', // other_approver, root_owner
        'buzz/README.md', // root_owner
      ]
    );
    let ownersCheck;

    beforeEach(async () => {
      ownersCheck = new OwnersCheck(repo, github, pr);

      sandbox.stub(ownersCheck.parser, 'parseAllOwnersRules').returns({
        rules: [
          new OwnersRule('OWNERS.yaml', ['root_owner']),
          new OwnersRule('foo/OWNERS.yaml', ['approver', 'some_user']),
          new OwnersRule('bar/OWNERS.yaml', ['other_approver']),
        ],
      });

      await ownersCheck.init();
    });

    it('returns true if any approver is an owner of the file', () => {
      expect(
        ownersCheck._hasOwnersApproval(
          'foo/test.js',
          ownersCheck.tree.atPath('foo/test.js')
        )
      ).toBe(true);
      expect(
        ownersCheck._hasOwnersApproval(
          'bar/baz/file.txt',
          ownersCheck.tree.atPath('bar/baz/file.txt')
        )
      ).toBe(true);
    });

    it('returns true if no owner has given approval', () => {
      expect(
        ownersCheck._hasOwnersApproval(
          'main.js',
          ownersCheck.tree.atPath('main.js')
        )
      ).toBe(false);
      expect(
        ownersCheck._hasOwnersApproval(
          'buzz/README.md',
          ownersCheck.tree.atPath('buzz/README.md')
        )
      ).toBe(false);
    });
  });

  describe('getApprovers', () => {
    it("returns the reviewers' usernames", async () => {
      const ownersCheck = new OwnersCheck(
        repo,
        new FakeGithub([approval, otherApproval], []),
        pr
      );
      const approvers = await ownersCheck._getApprovers();

      expect(approvers).toContain('approver', 'other_approver');
    });

    it('includes the author', async () => {
      const ownersCheck = new OwnersCheck(repo, new FakeGithub([], []), pr);
      const approvers = await ownersCheck._getApprovers();

      expect(approvers).toContain('the_author');
    });

    it('produces unique usernames', async () => {
      const ownersCheck = new OwnersCheck(
        repo,
        new FakeGithub([approval, approval, authorApproval], []),
        pr
      );
      const approvers = await ownersCheck._getApprovers();

      expect(approvers).toEqual(['approver', 'the_author']);
    });

    it('includes only reviewers who approved the review', async () => {
      const ownersCheck = new OwnersCheck(
        repo,
        new FakeGithub([approval, rejection], []),
        pr
      );
      const approvers = await ownersCheck._getApprovers();

      expect(approvers).not.toContain('rejector');
    });
  });

  describe('buildCurrentCoverageText', () => {
    let ownersCheck;

    beforeEach(() => {
      ownersCheck = new OwnersCheck(
        repo,
        new FakeGithub(
          [approval, otherApproval],
          [
            'main.js', // root_owner
            'foo/test.js', // approver, some_user, root_owner
            'bar/baz/file.txt', // other_approver, root_owner
            'buzz/README.md', // the_author, root_owner
          ]
        ),
        pr
      );
      sandbox.stub(ownersCheck.parser, 'parseAllOwnersRules').returns({
        rules: [
          new OwnersRule('OWNERS.yaml', ['root_owner']),
          new OwnersRule('foo/OWNERS.yaml', ['approver', 'some_user']),
          new OwnersRule('bar/OWNERS.yaml', ['other_approver']),
          new OwnersRule('buzz/OWNERS.yaml', ['the_author']),
        ],
      });
    });

    it('lists files with their owners approvers', async () => {
      await ownersCheck.init();
      const fileTreeMap = ownersCheck.tree.buildFileTreeMap(
        ownersCheck.changedFiles
      );
      const coverageText = ownersCheck.buildCurrentCoverageText(fileTreeMap);

      expect(coverageText).toContain('### Current Coverage');
      expect(coverageText).toContain('- foo/test.js _(approver)_');
      expect(coverageText).toContain('- bar/baz/file.txt _(other_approver)_');
      expect(coverageText).toContain('- buzz/README.md _(the_author)_');
    });

    it('lists files needing approval', async () => {
      await ownersCheck.init();
      const fileTreeMap = ownersCheck.tree.buildFileTreeMap(
        ownersCheck.changedFiles
      );
      const coverageText = ownersCheck.buildCurrentCoverageText(fileTreeMap);

      expect(coverageText).toContain('### Current Coverage');
      expect(coverageText).toContain('- **[NEEDS APPROVAL]** main.js');
    });
  });

  describe('buildReviewSuggestionsText', () => {
    it('displays review suggestions', () => {
      const ownersCheck = new OwnersCheck(repo, new FakeGithub([], []), pr);
      const reviewSuggestions = [
        ['alice', ['alice_file1.js', 'foo/alice_file2.js']],
        ['bob', ['bob_file1.js', 'bar/bob_file2.js']],
      ];

      expect(ownersCheck.buildReviewSuggestionsText(reviewSuggestions)).toEqual(
        '### Suggested Reviewers\n\n' +
          'Reviewer: _alice_\n' +
          '- alice_file1.js\n' +
          '- foo/alice_file2.js\n\n' +
          'Reviewer: _bob_\n' +
          '- bob_file1.js\n' +
          '- bar/bob_file2.js'
      );
    });
  });
});
