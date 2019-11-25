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
const {
  CheckRun,
  CheckRunState,
  OwnersCheck,
} = require('../../src/ownership/owners_check');
const {
  UserOwner,
  TeamOwner,
  OWNER_MODIFIER,
} = require('../../src/ownership/owner');
const {Team} = require('../../src/api/github');
const OwnersTree = require('../../src/ownership/tree');
const {OwnersRule, ReviewerSetRule} = require('../../src/ownership/rules');
const {ReviewerSelection} = require('../../src/reviewer_selection');

describe('check run', () => {
  const sandbox = sinon.createSandbox();

  afterEach(() => {
    sandbox.restore();
  });

  describe('json', () => {
    beforeEach(() => {
      sandbox.stub(CheckRun.prototype, 'helpText').value('HELP TEXT');
    });

    it('produces a JSON object in the GitHub API format', () => {
      const checkRun = new CheckRun(
        CheckRunState.NEUTRAL,
        'Test summary',
        'Test text'
      );
      const checkRunJson = checkRun.json;

      expect(checkRunJson.name).toEqual('ampproject/owners-check');
      expect(checkRunJson.output.title).toEqual('Test summary');
      expect(checkRunJson.output.summary).toEqual('Test summary');
      expect(checkRunJson.output.text).toEqual('Test text\n\nHELP TEXT');
    });

    it.each([
      [CheckRunState.SUCCESS, 'success'],
      [CheckRunState.FAILURE, 'failure'],
      [CheckRunState.NEUTRAL, 'neutral'],
      [CheckRunState.ACTION_REQUIRED, 'action_required'],
    ])(
      'with state %p has conclusion %p and "completed_at"',
      (state, conclusion) => {
        const checkRun = new CheckRun(state, 'Test summary', 'Test text');
        const checkRunJson = checkRun.json;

        expect(checkRunJson.status).toEqual('completed');
        expect(checkRunJson.conclusion).toEqual(conclusion);
        expect(checkRunJson.completed_at).not.toBeUndefined();
      }
    );

    it('with state "in_progress" has no conclusion or completed_at', () => {
      const checkRun = new CheckRun(
        CheckRunState.IN_PROGRESS,
        'Test summary',
        'Test text'
      );
      const checkRunJson = checkRun.json;

      expect(checkRunJson.status).toEqual('in_progress');
      expect(checkRunJson.conclusion).toBeUndefined();
      expect(checkRunJson.completed_at).toBeUndefined();
    });
  });
});

describe('owners check', () => {
  const sandbox = sinon.createSandbox();
  let ownersTree;
  let ownersCheck;
  let reviewerTeam;
  let reviewerSetRule;

  beforeEach(() => {
    ownersTree = new OwnersTree();
    [
      new OwnersRule('OWNERS', [new UserOwner('root_owner')]),
      new OwnersRule('foo/OWNERS', [
        new UserOwner('approver'),
        new UserOwner('some_user'),
      ]),
      new OwnersRule('bar/OWNERS', [new UserOwner('other_approver')]),
      new OwnersRule('buzz/OWNERS', [new UserOwner('the_author')]),
      new OwnersRule('extra/OWNERS', [new UserOwner('extra_reviewer')]),
    ].forEach(rule => ownersTree.addRule(rule));

    reviewerTeam = new Team(0, 'ampproject', 'reviewers-amphtml');
    reviewerSetRule = new ReviewerSetRule('OWNERS', [
      new TeamOwner(reviewerTeam),
    ]);

    ownersCheck = new OwnersCheck(
      ownersTree,
      [
        'main.js', // root_owner
        'foo/test.js', // approver, some_user, root_owner
        'foo/required/info.html', // approver, some_user, root_owner
        'bar/baz/file.txt', // other_approver, root_owner
        'buzz/README.md', // the_author, root_owner
        'extra/script.js', // extra_reviewer, root_owner
      ],
      {
        the_author: true,
        approver: true,
        other_approver: true,
        extra_reviewer: false,
      }
    );
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe('run', () => {
    it('builds a map of changed files and their ownership trees', () => {
      sandbox.stub(OwnersTree.prototype, 'buildFileTreeMap').callThrough();
      ownersCheck.run();

      sandbox.assert.calledWith(ownersCheck.tree.buildFileTreeMap, [
        'main.js',
        'foo/test.js',
        'foo/required/info.html',
        'bar/baz/file.txt',
        'buzz/README.md',
        'extra/script.js',
      ]);
    });

    it('picks reviewers', () => {
      sandbox.stub(ReviewerSelection, 'pickReviews').callThrough();
      ownersCheck.run();

      sandbox.assert.calledOnce(ReviewerSelection.pickReviews);
    });

    it("doesn't pick reviewers for a file with owner review requested", () => {
      let fileTreeMap;
      // Note: A spy cannot be used here because the assertion takes place after
      // reviewer selection, which empties out the file-tree map object.
      sandbox.stub(ReviewerSelection, 'pickReviews').callsFake(ftm => {
        fileTreeMap = ftm;
        return [];
      });
      ownersCheck.run();

      expect(fileTreeMap['extra/script.js']).toBeUndefined();
      sandbox.assert.calledOnce(ReviewerSelection.pickReviews);
    });

    describe('created check-run', () => {
      it('contains coverage information in the output', () => {
        sandbox
          .stub(OwnersCheck.prototype, 'buildCurrentCoverageText')
          .returns('%% COVERAGE INFO %%');
        const {checkRun} = ownersCheck.run();

        expect(checkRun.text).toContain('%% COVERAGE INFO %%');
      });

      describe('for a PR with owners coverage', () => {
        beforeEach(() => {
          sandbox.stub(OwnersTree.prototype, 'fileHasOwner').returns(true);
        });

        describe('without approval from a reviewer team member', () => {
          beforeEach(() => {
            ownersTree.addRule(reviewerSetRule);
          });

          it('has an in-progress status', () => {
            const {checkRun} = ownersCheck.run();
            expect(checkRun.json.status).toEqual('in_progress');
          });

          it('has a failing summary', () => {
            const {checkRun} = ownersCheck.run();
            expect(checkRun.summary).toEqual(
              'Missing review from a member of the reviewer set'
            );
          });

          it('contains the reviewer set in the output', () => {
            sandbox
              .stub(OwnersCheck.prototype, 'buildReviewerSetText')
              .returns('%% REVIEWER SET %%');
            const {checkRun} = ownersCheck.run();
            expect(checkRun.text).toContain('%% REVIEWER SET %%');
          });

          it('returns no reviewers to add', () => {
            // TODO(coder): Integrate into reviewer selection and suggest a
            // reviewer if possible.
            const {reviewers} = ownersCheck.run();
            expect(reviewers).toEqual([]);
          });
        });

        describe('with approval from a reviewer team member', () => {
          it('has a success conclusion', () => {
            const {checkRun} = ownersCheck.run();
            expect(checkRun.json.conclusion).toEqual('success');
          });

          it('has a passing summary', () => {
            const {checkRun} = ownersCheck.run();
            expect(checkRun.summary).toEqual(
              'All files in this PR have OWNERS approval'
            );
          });

          it('does not run reviewer selection', () => {
            sandbox.stub(ReviewerSelection, 'pickReviews');
            ownersCheck.run();
            sandbox.assert.notCalled(ReviewerSelection.pickReviews);
          });

          it('does output review suggestions', () => {
            sandbox.stub(OwnersCheck.prototype, 'buildReviewSuggestionsText');
            ownersCheck.run();
            sandbox.assert.notCalled(ownersCheck.buildReviewSuggestionsText);
          });

          it('returns no reviewers to add', () => {
            const {reviewers} = ownersCheck.run();
            expect(reviewers).toEqual([]);
          });
        });
      });

      describe('for a PR requiring approvals', () => {
        it('has an action-required conclusion', () => {
          const {checkRun} = ownersCheck.run();

          expect(checkRun.json.conclusion).toEqual('action_required');
        });

        it('has a failing summary', () => {
          const {checkRun} = ownersCheck.run();

          expect(checkRun.summary).toEqual(
            'Missing required OWNERS approvals! Suggested reviewers: root_owner'
          );
        });

        it('contains review suggestions in the output', () => {
          sandbox
            .stub(OwnersCheck.prototype, 'buildReviewSuggestionsText')
            .returns('%% REVIEW SUGGESTIONS %%');
          const {checkRun} = ownersCheck.run();

          expect(checkRun.text).toContain('%% REVIEW SUGGESTIONS %%');
        });

        it('returns reviewers to add', () => {
          const {reviewers} = ownersCheck.run();

          expect(reviewers).toEqual(['root_owner']);
        });
      });

      describe('if an error occurs', () => {
        beforeEach(() => {
          sandbox
            .stub(OwnersCheck.prototype, 'buildCurrentCoverageText')
            .throws(new Error('Something is wrong'));
        });

        it('has a failing conclusion', () => {
          const {checkRun} = ownersCheck.run();

          expect(checkRun.json.conclusion).toEqual('failure');
        });

        it('has an error summary', () => {
          const {checkRun} = ownersCheck.run();

          expect(checkRun.summary).toEqual('The check encountered an error!');
        });

        it('contains error details in the output', () => {
          const {checkRun} = ownersCheck.run();

          expect(checkRun.text).toEqual(
            'OWNERS check encountered an error:\nError: Something is wrong'
          );
        });
      });

      describe('if an error occurs in reviewer selection', () => {
        beforeEach(() => {
          sandbox
            .stub(ReviewerSelection, 'pickReviews')
            .throws(new Error('Something is wrong'));
        });

        it('has an action-required conclusion', () => {
          const {checkRun} = ownersCheck.run();

          expect(checkRun.json.conclusion).toEqual('action_required');
        });

        it('has a failing summary', () => {
          const {checkRun} = ownersCheck.run();

          expect(checkRun.summary).toContain(
            'Missing required OWNERS approvals!'
          );
        });

        it('contains error details in the output', () => {
          const {checkRun} = ownersCheck.run();

          expect(checkRun.text).toContain(
            'Encountered an error during reviewer selection: \n' +
              'Error: Something is wrong\n' +
              'Skipping reviewer assignment.'
          );
        });
      });
    });
  });

  describe('hasRequiredOwnersApproval', () => {
    describe('user owners', () => {
      it('fails if required user owners have not yet approved', () => {
        ownersTree.addRule(
          new OwnersRule('foo/required/OWNERS', [
            new UserOwner('required_reviewer', OWNER_MODIFIER.REQUIRE),
          ])
        );
        expect(
          ownersCheck._hasRequiredOwnersApproval(
            'foo/required/info.html',
            ownersCheck.tree.atPath('foo/required/info.html')
          )
        ).toBe(false);
      });

      it('fails if required user owners are pending approval', () => {
        ownersTree.addRule(
          new OwnersRule('foo/required/OWNERS', [
            new UserOwner('extra_reviewer', OWNER_MODIFIER.REQUIRE),
          ])
        );
        expect(
          ownersCheck._hasRequiredOwnersApproval(
            'foo/required/info.html',
            ownersCheck.tree.atPath('foo/required/info.html')
          )
        ).toBe(false);
      });

      it('passes if required user owners have approved', () => {
        ownersTree.addRule(
          new OwnersRule('foo/required/OWNERS', [
            new UserOwner('approver', OWNER_MODIFIER.REQUIRE),
          ])
        );
        expect(
          ownersCheck._hasRequiredOwnersApproval(
            'foo/required/info.html',
            ownersCheck.tree.atPath('foo/required/info.html')
          )
        ).toBe(true);
      });
    });

    describe('team owners', () => {
      it('fails if no member of the required team has approved', () => {
        const team = new Team(0, 'ampproject', 'my_team');
        team.members.push('required_reviewer');

        ownersTree.addRule(
          new OwnersRule('foo/required/OWNERS', [
            new TeamOwner(team, OWNER_MODIFIER.REQUIRE),
          ])
        );
        expect(
          ownersCheck._hasRequiredOwnersApproval(
            'foo/required/info.html',
            ownersCheck.tree.atPath('foo/required/info.html')
          )
        ).toBe(false);
      });

      it('fails if a member of the required team is pending approval', () => {
        const team = new Team(0, 'ampproject', 'my_team');
        team.members.push('extra_reviewer');

        ownersTree.addRule(
          new OwnersRule('foo/required/OWNERS', [
            new TeamOwner(team, OWNER_MODIFIER.REQUIRE),
          ])
        );
        expect(
          ownersCheck._hasRequiredOwnersApproval(
            'foo/required/info.html',
            ownersCheck.tree.atPath('foo/required/info.html')
          )
        ).toBe(false);
      });

      it('passes if any member of the required team is pending approval', () => {
        const team = new Team(0, 'ampproject', 'my_team');
        team.members.push('approver');

        ownersTree.addRule(
          new OwnersRule('foo/required/OWNERS', [
            new TeamOwner(team, OWNER_MODIFIER.REQUIRE),
          ])
        );
        expect(
          ownersCheck._hasRequiredOwnersApproval(
            'foo/required/info.html',
            ownersCheck.tree.atPath('foo/required/info.html')
          )
        ).toBe(true);
      });
    });

    describe('with multiple required owners', () => {
      beforeEach(() => {
        ownersTree.addRule(
          new OwnersRule('foo/required/OWNERS', [
            new UserOwner('approver', OWNER_MODIFIER.REQUIRE),
          ])
        );
      });

      it('fails if not all required rules are satisfied', () => {
        ownersTree.addRule(
          new OwnersRule('foo/required/OWNERS', [
            new UserOwner('required_reviewer', OWNER_MODIFIER.REQUIRE),
          ])
        );
        expect(
          ownersCheck._hasRequiredOwnersApproval(
            'foo/required/info.html',
            ownersCheck.tree.atPath('foo/required/info.html')
          )
        ).toBe(false);
      });

      it('passes if all required rules are satisfied', () => {
        const team = new Team(0, 'ampproject', 'my_team');
        team.members.push('other_approver');

        ownersTree.addRule(
          new OwnersRule('foo/required/OWNERS', [
            new UserOwner('the_author', OWNER_MODIFIER.REQUIRE),
          ])
        );
        ownersTree.addRule(
          new OwnersRule('foo/required/OWNERS', [
            new TeamOwner(team, OWNER_MODIFIER.REQUIRE),
          ])
        );

        expect(
          ownersCheck._hasRequiredOwnersApproval(
            'foo/required/info.html',
            ownersCheck.tree.atPath('foo/required/info.html')
          )
        ).toBe(true);
      });
    });
  });

  describe('hasFullOwnersCoverage', () => {
    it('returns true if any approver is an owner of the file', () => {
      expect(
        ownersCheck._hasFullOwnersCoverage(
          'foo/test.js',
          ownersCheck.tree.atPath('foo/test.js')
        )
      ).toBe(true);
      expect(
        ownersCheck._hasFullOwnersCoverage(
          'bar/baz/file.txt',
          ownersCheck.tree.atPath('bar/baz/file.txt')
        )
      ).toBe(true);
      expect(
        ownersCheck._hasFullOwnersCoverage(
          'buzz/README.md',
          ownersCheck.tree.atPath('buzz/README.md')
        )
      ).toBe(true);
    });

    it('returns false if no owner has given approval', () => {
      expect(
        ownersCheck._hasFullOwnersCoverage(
          'main.js',
          ownersCheck.tree.atPath('main.js')
        )
      ).toBe(false);
      expect(
        ownersCheck._hasFullOwnersCoverage(
          'baz/README.md',
          ownersCheck.tree.atPath('baz/README.md')
        )
      ).toBe(false);
    });

    it('ignores reviewers that have not yet approved', () => {
      expect(
        ownersCheck._hasFullOwnersCoverage(
          'extra/script.js',
          ownersCheck.tree.atPath('extra/script.js')
        )
      ).toBe(false);
    });

    it('fails if it does not have required reviewer approval', () => {
      sandbox
        .stub(OwnersCheck.prototype, '_hasRequiredOwnersApproval')
        .returns(false);
      expect(
        ownersCheck._hasFullOwnersCoverage(
          'foo/required/info.html',
          ownersCheck.tree.atPath('foo/required/info.html')
        )
      ).toBe(false);
    });
  });

  describe('hasOwnersPendingReview', () => {
    it('returns true if there are reviewers that have not yet approved', () => {
      expect(
        ownersCheck._hasOwnersPendingReview(
          'extra/script.js',
          ownersCheck.tree.atPath('extra/script.js')
        )
      ).toBe(true);
    });
  });

  describe('prHasReviewerSetApproval', () => {
    it('returns true if there is no reviewer set', () => {
      expect(ownersCheck._prHasReviewerSetApproval()).toBe(true);
    });

    describe('with a reviewer set team', () => {
      beforeEach(() => {
        ownersTree.addRule(reviewerSetRule);
      });

      it('returns true if there are approvers in the reviewer set', () => {
        reviewerTeam.members.push('approver');
        expect(ownersCheck._prHasReviewerSetApproval()).toBe(true);
      });

      it('returns false if no one in the reviewer set is a reviewer', () => {
        reviewerTeam.members.push('not_a_reviewer');
        expect(ownersCheck._prHasReviewerSetApproval()).toBe(false);
      });

      it('returns false if the only reviewer set member is pending', () => {
        reviewerTeam.members.push('extra_reviewer');
        expect(ownersCheck._prHasReviewerSetApproval()).toBe(false);
      });
    });
  });

  describe('buildCurrentCoverageText', () => {
    let coverageText;

    beforeEach(() => {
      ownersTree.addRule(
        new OwnersRule('foo/required/OWNERS', [
          new UserOwner('required_reviewer', OWNER_MODIFIER.REQUIRE),
        ])
      );
      const fileTreeMap = ownersCheck.tree.buildFileTreeMap(
        ownersCheck.changedFilenames
      );
      coverageText = ownersCheck.buildCurrentCoverageText(fileTreeMap);
    });

    it('lists files with their owners approvers', () => {
      expect(coverageText).toContain('### Current Coverage');
      expect(coverageText).toContain('- foo/test.js _(approver)_');
      expect(coverageText).toContain('- bar/baz/file.txt _(other_approver)_');
      expect(coverageText).toContain('- buzz/README.md _(the_author)_');
    });

    it('lists files needing approval', () => {
      expect(coverageText).toContain('### Current Coverage');
      expect(coverageText).toContain('- **[NEEDS APPROVAL]** main.js');
    });

    it('shows existing reviewers that could approve files', () => {
      expect(coverageText).toContain('### Current Coverage');
      expect(coverageText).toContain(
        '- **[NEEDS APPROVAL]** extra/script.js _(requested: extra_reviewer)_'
      );
    });

    it('shows missing required', () => {
      expect(coverageText).toContain('### Current Coverage');
      expect(coverageText).toContain(
        '- **[NEEDS APPROVAL]** foo/required/info.html ' +
          '_(required: required_reviewer)_'
      );
    });
  });

  describe('buildReviewSuggestionsText', () => {
    it('displays review suggestions', () => {
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

  describe('buildReviewerSetText', () => {
    it('displays review suggestions', () => {
      const team = new Team(0, 'ampproject', 'my_team');
      team.members.push('someone');
      const reviewers = [new UserOwner('coder'), new TeamOwner(team)];

      expect(ownersCheck.buildReviewerSetText(reviewers)).toEqual(
        'All PRs need approval from at least one member of the reviewer set: ' +
          'coder, ampproject/my_team [someone]'
      );
    });
  });
});
