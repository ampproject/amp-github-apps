/**
 * * Copyright 2019 The AMP HTML Authors. All Rights Reserved.
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

const fs = require('fs');
const owners = require('..');
const path = require('path');
const sinon = require('sinon');
const {Probot, Server, ProbotOctokit} = require('probot');

const VirtualRepository = require('../src/repo/virtual_repo');
const {CheckRun, CheckRunState} = require('../src/ownership/owners_check');
const {GitHub, Team, Review, PullRequest} = require('../src/api/github');
const {OwnersBot} = require('../src/owners_bot');
const {OwnersParser} = require('../src/ownership/parser');
const {OwnersRule} = require('../src/ownership/rules');
const {UserOwner} = require('../src/ownership/owner');

const opened35 = require('./fixtures/actions/opened.35');
const opened36 = require('./fixtures/actions/opened.36.author-is-owner');
const openedDraft25408 = require('./fixtures/actions/opened.draft.25408');
const rerequest35 = require('./fixtures/actions/rerequested.35');
const review35 = require('./fixtures/actions/pull_request_review.35.submitted');

jest.setTimeout(30000);

const GITHUB_OWNER = 'githubuser';
const GITHUB_REPOSITORY = 'github-owners-bot-test-repo';
const ownersRules = [
  new OwnersRule('OWNERS', [new UserOwner('donttrustthisbot')]),
  new OwnersRule('dir1/OWNERS', [new UserOwner('donttrustthisbot')]),
  new OwnersRule('dir2/OWNERS', [new UserOwner('githubuser')]),
  new OwnersRule('dir2/dir1/dir1/OWNERS', [new UserOwner('githubuser')]),
];

/**
 * Get a JSON test fixture object.
 *
 * @param {!string} name name of the JSON fixture file (without .json).
 * @return {!object} the named JSON test fixture file.
 */
function getFixture(name) {
  return JSON.parse(
    fs.readFileSync(path.join(__dirname, `fixtures/${name}.json`))
  );
}

describe('GitHub app', () => {
  let probot;
  let sandbox;

  beforeEach(() => {
    process.env = {
      DISABLE_WEBHOOK_EVENT_CHECK: 'true',
      GITHUB_OWNER,
      GITHUB_REPOSITORY,
      GITHUB_ACCESS_TOKEN: '_TOKEN_',
      NODE_ENV: 'test',
    };

    sandbox = sinon.createSandbox();
    sandbox.stub(VirtualRepository.prototype, 'sync');
    sandbox.stub(VirtualRepository.prototype, 'warmCache').resolves();
    sandbox.stub(OwnersBot.prototype, 'initTeams').resolves();
    sandbox.stub(OwnersBot.prototype, 'refreshTree').resolves();
    sandbox.stub(GitHub.prototype);
    GitHub.prototype.getReviewRequests.returns([]);
    sandbox.stub(CheckRun.prototype, 'helpText').value('HELP TEXT');
    sandbox
      .stub(OwnersParser.prototype, 'parseAllOwnersRules')
      .returns({result: ownersRules, errors: []});

    const server = new Server({
      Probot: Probot.defaults({
        githubToken: 'test',
        // Disable throttling & retrying requests for easier testing
        Octokit: ProbotOctokit.defaults({
          retry: {enabled: false},
          throttle: {enabled: false},
        }),
      }),
    });
    server.load(owners);
    probot = server.probotApp;
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe('when there are more than 1 checks on a PR', () => {
    test('it should update amp owners bot check when there is one', async () => {
      GitHub.prototype.listFiles.resolves(['dir2/dir1/dir1/file.txt']);
      GitHub.prototype.getReviews.resolves([]);
      GitHub.prototype.getCheckRunIds.resolves({
        'owners-check': 53472315,
        'another-check': 53472313,
      });
      GitHub.prototype.updateCheckRun.resolves();

      await probot.receive({name: 'pull_request', payload: opened35});

      sandbox.assert.calledOnce(GitHub.prototype.listFiles);
      sandbox.assert.calledOnce(GitHub.prototype.getReviews);
      sandbox.assert.calledOnce(GitHub.prototype.getCheckRunIds);
      sandbox.assert.calledOnceWithExactly(
        GitHub.prototype.updateCheckRun,
        53472315,
        new CheckRun(
          CheckRunState.ACTION_REQUIRED,
          'Missing required OWNERS approvals! Suggested reviewers: githubuser',
          '### Current Coverage\n' +
            '\n' +
            '- **[NEEDS APPROVAL]** `dir2/dir1/dir1/file.txt`\n' +
            '\n' +
            '### Suggested Reviewers\n' +
            '\n' +
            'Reviewer: _githubuser_\n' +
            '- `dir2/dir1/dir1/file.txt`'
        )
      );
    });
  });

  describe('create check run', () => {
    test('with failure check when there are 0 reviews on a pull request', async () => {
      GitHub.prototype.listFiles.resolves(['dir2/dir1/dir1/file.txt']);
      GitHub.prototype.getReviews.resolves([]);
      GitHub.prototype.getCheckRunIds.resolves({});
      GitHub.prototype.createCheckRun.resolves();

      await probot.receive({name: 'pull_request', payload: opened35});

      sandbox.assert.calledOnce(GitHub.prototype.listFiles);
      sandbox.assert.calledOnce(GitHub.prototype.getReviews);
      sandbox.assert.calledOnce(GitHub.prototype.getCheckRunIds);
      sandbox.assert.calledOnceWithExactly(
        GitHub.prototype.createCheckRun,
        '9272f18514cbd3fa935b3ced62ae1c2bf6efa76d',
        new CheckRun(
          CheckRunState.ACTION_REQUIRED,
          'Missing required OWNERS approvals! Suggested reviewers: githubuser',
          '### Current Coverage\n' +
            '\n' +
            '- **[NEEDS APPROVAL]** `dir2/dir1/dir1/file.txt`\n' +
            '\n' +
            '### Suggested Reviewers\n' +
            '\n' +
            'Reviewer: _githubuser_\n' +
            '- `dir2/dir1/dir1/file.txt`'
        )
      );
    });
  });

  describe('update check run', () => {
    test('with failure check when there are 0 reviews on a pull request', async () => {
      GitHub.prototype.listFiles.resolves(['dir2/dir1/dir1/file.txt']);
      GitHub.prototype.getReviews.resolves([]);
      GitHub.prototype.getCheckRunIds.resolves({
        'owners-check': 53472313,
      });
      GitHub.prototype.updateCheckRun.resolves();

      await probot.receive({name: 'pull_request', payload: opened35});

      sandbox.assert.calledOnce(GitHub.prototype.listFiles);
      sandbox.assert.calledOnce(GitHub.prototype.getReviews);
      sandbox.assert.calledOnce(GitHub.prototype.getCheckRunIds);
      sandbox.assert.calledOnceWithExactly(
        GitHub.prototype.updateCheckRun,
        53472313,
        new CheckRun(
          CheckRunState.ACTION_REQUIRED,
          'Missing required OWNERS approvals! Suggested reviewers: githubuser',
          '### Current Coverage\n' +
            '\n' +
            '- **[NEEDS APPROVAL]** `dir2/dir1/dir1/file.txt`\n' +
            '\n' +
            '### Suggested Reviewers\n' +
            '\n' +
            'Reviewer: _githubuser_\n' +
            '- `dir2/dir1/dir1/file.txt`'
        )
      );
    });

    test('with failure check when there are 0 reviews on a pull request and multiple files', async () => {
      GitHub.prototype.listFiles.resolves([
        'dir2/dir1/dir1/file.txt',
        'dir2/dir1/dir1/file-2.txt',
      ]);
      GitHub.prototype.getReviews.resolves([]);
      GitHub.prototype.getCheckRunIds.resolves({
        'owners-check': 53472313,
      });
      GitHub.prototype.updateCheckRun.resolves();

      await probot.receive({name: 'pull_request', payload: opened35});

      sandbox.assert.calledOnce(GitHub.prototype.listFiles);
      sandbox.assert.calledOnce(GitHub.prototype.getReviews);
      sandbox.assert.calledOnce(GitHub.prototype.getCheckRunIds);
      sandbox.assert.calledOnce(GitHub.prototype.updateCheckRun);
    });
  });

  describe('rerequest check run', () => {
    test('should re-evaluate pull request', async () => {
      GitHub.prototype.getPullRequest.resolves(
        new PullRequest(
          35,
          'ampprojectbot',
          '9272f18514cbd3fa935b3ced62ae1c2bf6efa76d',
          'Pull request description',
          'open'
        )
      );
      GitHub.prototype.listFiles.resolves(['dir2/dir1/dir1/file.txt']);
      GitHub.prototype.getReviews.resolves([]);
      GitHub.prototype.getCheckRunIds.resolves({});
      GitHub.prototype.updateCheckRun.resolves();

      await probot.receive({name: 'check_run', payload: rerequest35});

      sandbox.assert.calledOnceWithExactly(GitHub.prototype.getPullRequest, 35);
      sandbox.assert.calledOnceWithExactly(
        GitHub.prototype.createCheckRun,
        '9272f18514cbd3fa935b3ced62ae1c2bf6efa76d',
        new CheckRun(
          CheckRunState.ACTION_REQUIRED,
          'Missing required OWNERS approvals! Suggested reviewers: githubuser',
          '### Current Coverage\n' +
            '\n' +
            '- **[NEEDS APPROVAL]** `dir2/dir1/dir1/file.txt`\n' +
            '\n' +
            '### Suggested Reviewers\n' +
            '\n' +
            'Reviewer: _githubuser_\n' +
            '- `dir2/dir1/dir1/file.txt`'
        )
      );
    });
  });

  describe('has approvals met', () => {
    test('with passing check when there is 1 approver on a pull request', async () => {
      GitHub.prototype.listFiles.resolves(['dir2/dir1/dir1/file.txt']);
      GitHub.prototype.getReviews.resolves([
        new Review('githubuser', 'approved', new Date()),
      ]);
      GitHub.prototype.getCheckRunIds.resolves({});
      GitHub.prototype.createCheckRun.resolves();

      await probot.receive({name: 'pull_request', payload: opened35});

      sandbox.assert.calledOnceWithExactly(
        GitHub.prototype.createCheckRun,
        '9272f18514cbd3fa935b3ced62ae1c2bf6efa76d',
        new CheckRun(
          CheckRunState.SUCCESS,
          'All files in this PR have OWNERS approval',
          '### Current Coverage\n' +
            '\n' +
            '- `dir2/dir1/dir1/file.txt` _(githubuser)_'
        )
      );
    });

    test('with passing check when author themselves are owners', async () => {
      GitHub.prototype.listFiles.resolves(['dir2/new-file.txt']);
      GitHub.prototype.getReviews.resolves([]);
      GitHub.prototype.getCheckRunIds.resolves({});
      GitHub.prototype.createCheckRun.resolves();

      await probot.receive({name: 'pull_request', payload: opened36});

      sandbox.assert.calledOnceWithExactly(
        GitHub.prototype.createCheckRun,
        'c7fdbd7f947fca608b20006da8535af5384ab699',
        new CheckRun(
          CheckRunState.SUCCESS,
          'All files in this PR have OWNERS approval',
          '### Current Coverage\n' +
            '\n' +
            '- `dir2/new-file.txt` _(githubuser)_'
        )
      );
    });
  });

  describe('pull request review', () => {
    test('triggers pull request re-evaluation', async () => {
      GitHub.prototype.getPullRequest.resolves(
        new PullRequest(
          35,
          'ampprojectbot',
          '9272f18514cbd3fa935b3ced62ae1c2bf6efa76d',
          'Pull request description',
          'open'
        )
      );
      GitHub.prototype.listFiles.resolves(['dir2/dir1/dir1/file.txt']);
      GitHub.prototype.getReviews.resolves([
        new Review('githubuser', 'approved', new Date()),
      ]);
      GitHub.prototype.getCheckRunIds.resolves({});
      GitHub.prototype.createCheckRun.resolves();

      await probot.receive({name: 'pull_request_review', payload: review35});

      sandbox.assert.calledOnceWithExactly(GitHub.prototype.getPullRequest, 35);
      sandbox.assert.calledOnceWithExactly(
        GitHub.prototype.createCheckRun,
        '9272f18514cbd3fa935b3ced62ae1c2bf6efa76d',
        new CheckRun(
          CheckRunState.SUCCESS,
          'All files in this PR have OWNERS approval',
          '### Current Coverage\n' +
            '\n' +
            '- `dir2/dir1/dir1/file.txt` _(githubuser)_'
        )
      );
    });
  });

  describe('team membership changes', () => {
    beforeEach(() => {
      sandbox.stub(Team.prototype, 'fetchMembers');
    });

    it.each([
      ['team.created'],
      ['team.deleted'],
      ['team.edited'],
      ['membership.added'],
      ['membership.removed'],
    ])('updates the team members on event %p', async name => {
      Team.prototype.fetchMembers.resolves(['coder']);

      await probot.receive({
        name,
        payload: {
          team: {id: 42, slug: 'my-team'},
        },
      });

      sandbox.assert.calledOnce(Team.prototype.fetchMembers);
    });
  });

  describe('PRs that should not assign reviewers right away', () => {
    beforeEach(() => {
      sandbox.stub(OwnersBot.prototype, 'runOwnersCheck').callThrough();
    });

    it('does not run the check on for draft PRs', async () => {
      await probot.receive({
        name: 'pull_request.opened',
        payload: openedDraft25408,
      });

      sandbox.assert.notCalled(OwnersBot.prototype.runOwnersCheck);
    });

    it('does assign reviewers for draft PRs once they are ready', async () => {
      GitHub.prototype.listFiles.resolves([]);
      GitHub.prototype.getReviews.resolves([]);
      GitHub.prototype.getCheckRunIds.resolves({});
      GitHub.prototype.createCheckRun.resolves();

      const payload = getFixture('actions/ready_for_review.25408');
      payload.pull_request.title = 'I am ready now!';
      await probot.receive({
        name: 'pull_request.ready_for_review',
        payload,
      });

      sandbox.assert.calledOnce(OwnersBot.prototype.runOwnersCheck);
      expect(OwnersBot.prototype.runOwnersCheck.getCall(0).args[2]).toBe(true);
    });

    it.each([['DO NOT SUBMIT'], ['WIP']])(
      'does not assign reviewers when the title contains "%s"',
      async phrase => {
        GitHub.prototype.listFiles.resolves([]);
        GitHub.prototype.getReviews.resolves([]);
        GitHub.prototype.getCheckRunIds.resolves({});
        GitHub.prototype.createCheckRun.resolves();

        const payload = getFixture('actions/opened.35');
        payload.pull_request.title = `DO NOT SUBMIT: ${phrase}`;
        await probot.receive({
          name: 'pull_request.opened',
          payload,
        });

        sandbox.assert.calledOnce(OwnersBot.prototype.runOwnersCheck);
        expect(OwnersBot.prototype.runOwnersCheck.getCall(0).args[2]).toBe(
          false
        );
      }
    );
  });

  describe('closed PRs', () => {
    let pullRequest;
    let payload;

    beforeEach(() => {
      pullRequest = require('./fixtures/pulls/pull_request.35');
      payload = {'pull_request': pullRequest};
    });

    it('does nothing for a non-merged PR', async () => {
      pullRequest.merged = false;
      await probot.receive({name: 'pull_request.closed', payload});

      sandbox.assert.notCalled(OwnersBot.prototype.refreshTree);
    });

    describe('merged PRs', () => {
      beforeEach(() => {
        pullRequest.merged = true;
      });

      it('does nothing for a PR without owners files', async () => {
        GitHub.prototype.listFiles.resolves(['foo.txt']);

        await probot.receive({name: 'pull_request.closed', payload});

        sandbox.assert.notCalled(OwnersBot.prototype.refreshTree);
      });

      it('refreshes the owners tree for a PR with owners files', async () => {
        GitHub.prototype.listFiles.resolves(['OWNERS']);

        await probot.receive({name: 'pull_request.closed', payload});

        sandbox.assert.calledOnce(OwnersBot.prototype.refreshTree);
      });
    });
  });
});
