/**
 * Copyright 2019 Google Inc.
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

/* eslint max-len: 0 */
const fs = require('fs');
const nock = require('nock');
const owners = require('..');
const path = require('path');
const sinon = require('sinon');
const {Probot} = require('probot');

const VirtualRepository = require('../src/repo/virtual_repo');
const {CheckRun} = require('../src/ownership/owners_check');
const {GitHub, Team} = require('../src/api/github');
const {OwnersBot} = require('../src/owners_bot');
const {OwnersParser} = require('../src/ownership/parser');
const {OwnersRule} = require('../src/ownership/rules');
const {UserOwner} = require('../src/ownership/owner');

const opened35 = require('./fixtures/actions/opened.35');
const opened36 = require('./fixtures/actions/opened.36.author-is-owner');
const openedDraft25408 = require('./fixtures/actions/opened.draft.25408');
const rerequest35 = require('./fixtures/actions/rerequested.35');
const review35 = require('./fixtures/actions/pull_request_review.35.submitted');

const files35 = require('./fixtures/files/files.35');
const files35Multiple = require('./fixtures/files/files.35.multiple');
const files36 = require('./fixtures/files/files.36');

const reviews35 = require('./fixtures/reviews/reviews.35');
const reviews35Approved = require('./fixtures/reviews/reviews.35.approved');

const checkruns35 = require('./fixtures/check-runs/check-runs.get.35');
const checkruns35Empty = require('./fixtures/check-runs/check-runs.get.35.empty');
const checkruns35Multiple = require('./fixtures/check-runs/check-runs.get.35.multiple');

const pullRequest35 = require('./fixtures/pulls/pull_request.35');

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

  beforeAll(() => {
    nock.disableNetConnect();
  });

  afterAll(() => {
    nock.enableNetConnect();
  });

  beforeEach(() => {
    process.env = {
      DISABLE_WEBHOOK_EVENT_CHECK: 'true',
      GITHUB_OWNER,
      GITHUB_REPOSITORY,
      NODE_ENV: 'test',
    };

    sandbox = sinon.createSandbox();
    sandbox.stub(VirtualRepository.prototype, 'sync');
    sandbox.stub(VirtualRepository.prototype, 'warmCache').resolves();
    sandbox.stub(OwnersBot.prototype, 'initTeams').resolves();
    sandbox.stub(GitHub.prototype, 'getBotComments').returns([]);
    sandbox.stub(GitHub.prototype, 'getReviewRequests').returns([]);
    sandbox.stub(GitHub.prototype, 'createReviewRequests').returns([]);
    sandbox.stub(CheckRun.prototype, 'helpText').value('HELP TEXT');
    sandbox
      .stub(OwnersParser.prototype, 'parseAllOwnersRules')
      .returns({result: ownersRules, errors: []});
    nock('https://api.github.com')
      .post('/app/installations/588033/access_tokens')
      .reply(200, {token: 'test'});

    probot = new Probot({});
    const app = probot.load(owners);

    // Return a test token.
    app.app = {
      getInstallationAccessToken: () => Promise.resolve('test'),
      getSignedJsonWebToken: () => Promise.resolve('test'),
    };
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe('when there are more than 1 checks on a PR', () => {
    test('it should update amp owners bot check when there is one', async () => {
      expect.assertions(4);
      nock('https://api.github.com')
        // We need the list of files on a pull request to evaluate the required
        // reviewers.
        .get(
          '/repos/githubuser/github-owners-bot-test-repo/pulls/35/files?per_page=100'
        )
        .reply(200, files35)
        // We need the reviews to check if a pull request has been approved or
        // not.
        .get(
          '/repos/githubuser/github-owners-bot-test-repo/pulls/35/reviews?per_page=100'
        )
        .reply(200, reviews35)
        .get(
          '/repos/githubuser/github-owners-bot-test-repo/commits/9272f18514cbd3fa935b3ced62ae1c2bf6efa76d/check-runs'
        )
        .reply(200, checkruns35Multiple)
        // Test that a check-run is created
        .patch(
          '/repos/githubuser/github-owners-bot-test-repo/check-runs/53472315',
          body => {
            expect(body).toMatchObject({
              conclusion: 'action_required',
              output: {
                title:
                  'Missing required OWNERS approvals! Suggested reviewers: githubuser',
                summary:
                  'Missing required OWNERS approvals! Suggested reviewers: githubuser',
              },
            });
            expect(body.output.text).toContain(
              '### Current Coverage\n\n' +
                '- **[NEEDS APPROVAL]** dir2/dir1/dir1/file.txt'
            );
            expect(body.output.text).toContain(
              '### Suggested Reviewers\n\n' +
                'Reviewer: _githubuser_\n' +
                '- dir2/dir1/dir1/file.txt'
            );
            expect(body.output.text).toContain('HELP TEXT');

            return true;
          }
        )
        .reply(200);

      await probot.receive({name: 'pull_request', payload: opened35});
    });
  });

  describe('create check run', () => {
    test('with failure check when there are 0 reviews on a pull request', async () => {
      expect.assertions(4);
      nock('https://api.github.com')
        // We need the list of files on a pull request to evaluate the required
        // reviewers.
        .get(
          '/repos/githubuser/github-owners-bot-test-repo/pulls/35/files?per_page=100'
        )
        .reply(200, files35)
        // We need the reviews to check if a pull request has been approved or
        // not.
        .get(
          '/repos/githubuser/github-owners-bot-test-repo/pulls/35/reviews?per_page=100'
        )
        .reply(200, reviews35)
        // Get check runs for a specific commit
        .get(
          '/repos/githubuser/github-owners-bot-test-repo/commits/9272f18514cbd3fa935b3ced62ae1c2bf6efa76d/check-runs'
        )
        .reply(200, checkruns35Empty)
        // Test that a check-run is created
        .post(
          '/repos/githubuser/github-owners-bot-test-repo/check-runs',
          body => {
            expect(body).toMatchObject({
              name: 'ampproject/owners-check',
              head_sha: opened35.pull_request.head.sha,
              status: 'completed',
              conclusion: 'action_required',
              output: {
                title:
                  'Missing required OWNERS approvals! Suggested reviewers: githubuser',
                summary:
                  'Missing required OWNERS approvals! Suggested reviewers: githubuser',
              },
            });
            expect(body.output.text).toContain(
              '### Current Coverage\n\n' +
                '- **[NEEDS APPROVAL]** dir2/dir1/dir1/file.txt'
            );
            expect(body.output.text).toContain(
              '### Suggested Reviewers\n\n' +
                'Reviewer: _githubuser_\n' +
                '- dir2/dir1/dir1/file.txt'
            );
            expect(body.output.text).toContain('HELP TEXT');

            return true;
          }
        )
        .reply(200);

      await probot.receive({name: 'pull_request', payload: opened35});
    });
  });

  describe('update check run', () => {
    test('with failure check when there are 0 reviews on a pull request', async () => {
      expect.assertions(4);
      nock('https://api.github.com')
        // We need the list of files on a pull request to evaluate the required
        // reviewers.
        .get(
          '/repos/githubuser/github-owners-bot-test-repo/pulls/35/files?per_page=100'
        )
        .reply(200, files35)
        // We need the reviews to check if a pull request has been approved or
        // not.
        .get(
          '/repos/githubuser/github-owners-bot-test-repo/pulls/35/reviews?per_page=100'
        )
        .reply(200, reviews35)
        .get(
          '/repos/githubuser/github-owners-bot-test-repo/commits/9272f18514cbd3fa935b3ced62ae1c2bf6efa76d/check-runs'
        )
        .reply(200, checkruns35)
        // Test that a check-run is created
        .patch(
          '/repos/githubuser/github-owners-bot-test-repo/check-runs/53472313',
          body => {
            expect(body).toMatchObject({
              conclusion: 'action_required',
              output: {
                title:
                  'Missing required OWNERS approvals! Suggested reviewers: githubuser',
                summary:
                  'Missing required OWNERS approvals! Suggested reviewers: githubuser',
              },
            });
            expect(body.output.text).toContain(
              '### Current Coverage\n\n' +
                '- **[NEEDS APPROVAL]** dir2/dir1/dir1/file.txt'
            );
            expect(body.output.text).toContain(
              '### Suggested Reviewers\n\n' +
                'Reviewer: _githubuser_\n' +
                '- dir2/dir1/dir1/file.txt'
            );
            expect(body.output.text).toContain('HELP TEXT');

            return true;
          }
        )
        .reply(200);

      await probot.receive({name: 'pull_request', payload: opened35});
    });

    test('with failure check when there are 0 reviews on a pull request and multiple files', async () => {
      expect.assertions(4);
      nock('https://api.github.com')
        // We need the list of files on a pull request to evaluate the required
        // reviewers.
        .get(
          '/repos/githubuser/github-owners-bot-test-repo/pulls/35/files?per_page=100'
        )
        .reply(200, files35Multiple)
        // We need the reviews to check if a pull request has been approved or
        // not.
        .get(
          '/repos/githubuser/github-owners-bot-test-repo/pulls/35/reviews?per_page=100'
        )
        .reply(200, reviews35)
        .get(
          '/repos/githubuser/github-owners-bot-test-repo/commits/9272f18514cbd3fa935b3ced62ae1c2bf6efa76d/check-runs'
        )
        .reply(200, checkruns35)
        // Test that a check-run is created
        .patch(
          '/repos/githubuser/github-owners-bot-test-repo/check-runs/53472313',
          body => {
            expect(body).toMatchObject({
              conclusion: 'action_required',
              output: {
                title:
                  'Missing required OWNERS approvals! Suggested reviewers: githubuser',
                summary:
                  'Missing required OWNERS approvals! Suggested reviewers: githubuser',
              },
            });
            expect(body.output.text).toContain(
              '### Current Coverage\n\n' +
                '- **[NEEDS APPROVAL]** dir2/dir1/dir1/file.txt\n' +
                '- **[NEEDS APPROVAL]** dir2/dir1/dir1/file-2.txt'
            );
            expect(body.output.text).toContain(
              '### Suggested Reviewers\n\n' +
                'Reviewer: _githubuser_\n' +
                '- dir2/dir1/dir1/file.txt\n' +
                '- dir2/dir1/dir1/file-2.txt'
            );
            expect(body.output.text).toContain('HELP TEXT');

            return true;
          }
        )
        .reply(200);

      await probot.receive({name: 'pull_request', payload: opened35});
    });
  });

  describe('rerequest check run', () => {
    test('should re-evaluate pull request', async () => {
      expect.assertions(4);
      nock('https://api.github.com')
        // We need the list of files on a pull request to evaluate the required
        // reviewers.
        .get('/repos/githubuser/github-owners-bot-test-repo/pulls/35')
        .reply(200, pullRequest35)
        // We need the list of files on a pull request to evaluate the required
        // reviewers.
        .get(
          '/repos/githubuser/github-owners-bot-test-repo/pulls/35/files?per_page=100'
        )
        .reply(200, files35)
        // We need the reviews to check if a pull request has been approved or
        // not.
        .get(
          '/repos/githubuser/github-owners-bot-test-repo/pulls/35/reviews?per_page=100'
        )
        .reply(200, reviews35)
        .get(
          '/repos/githubuser/github-owners-bot-test-repo/commits/9272f18514cbd3fa935b3ced62ae1c2bf6efa76d/check-runs'
        )
        .reply(200, checkruns35Empty)
        // Test that a check-run is created
        .post(
          '/repos/githubuser/github-owners-bot-test-repo/check-runs',
          body => {
            expect(body).toMatchObject({
              name: 'ampproject/owners-check',
              head_sha: opened35.pull_request.head.sha,
              status: 'completed',
              conclusion: 'action_required',
              output: {
                title:
                  'Missing required OWNERS approvals! Suggested reviewers: githubuser',
                summary:
                  'Missing required OWNERS approvals! Suggested reviewers: githubuser',
              },
            });
            expect(body.output.text).toContain(
              '### Current Coverage\n\n' +
                '- **[NEEDS APPROVAL]** dir2/dir1/dir1/file.txt'
            );
            expect(body.output.text).toContain(
              '### Suggested Reviewers\n\n' +
                'Reviewer: _githubuser_\n' +
                '- dir2/dir1/dir1/file.txt'
            );
            expect(body.output.text).toContain('HELP TEXT');

            return true;
          }
        )
        .reply(200);

      await probot.receive({name: 'check_run', payload: rerequest35});
    });
  });

  describe('has approvals met', () => {
    test('with passing check when there is 1 approver on a pull request', async () => {
      expect.assertions(3);
      nock('https://api.github.com')
        // We need the list of files on a pull request to evaluate the required
        // reviewers.
        .get(
          '/repos/githubuser/github-owners-bot-test-repo/pulls/35/files?per_page=100'
        )
        .reply(200, files35)
        // We need the reviews to check if a pull request has been approved or
        // not.
        .get(
          '/repos/githubuser/github-owners-bot-test-repo/pulls/35/reviews?per_page=100'
        )
        .reply(200, reviews35Approved)
        .get(
          '/repos/githubuser/github-owners-bot-test-repo/commits/' +
            '9272f18514cbd3fa935b3ced62ae1c2bf6efa76d/check-runs'
        )
        .reply(200, checkruns35Empty)
        // Test that a check-run is created
        .post(
          '/repos/githubuser/github-owners-bot-test-repo/check-runs',
          body => {
            expect(body).toMatchObject({
              name: 'ampproject/owners-check',
              head_sha: opened35.pull_request.head.sha,
              status: 'completed',
              conclusion: 'success',
              output: {
                title: 'All files in this PR have OWNERS approval',
                summary: 'All files in this PR have OWNERS approval',
              },
            });
            expect(body.output.text).toContain(
              '### Current Coverage\n\n' +
                '- dir2/dir1/dir1/file.txt _(githubuser)_'
            );
            expect(body.output.text).toContain('HELP TEXT');

            return true;
          }
        )
        .reply(200);

      await probot.receive({name: 'pull_request', payload: opened35});
    });

    test('with passing check when author themselves are owners', async () => {
      expect.assertions(3);
      nock('https://api.github.com')
        // We need the list of files on a pull request to evaluate the required
        // reviewers.
        .get(
          '/repos/githubuser/github-owners-bot-test-repo/pulls/36/files?per_page=100'
        )
        .reply(200, files36)
        // We need the reviews to check if a pull request has been approved or
        // not.
        .get(
          '/repos/githubuser/github-owners-bot-test-repo/pulls/36/reviews?per_page=100'
        )
        .reply(200, reviews35)
        .get(
          '/repos/githubuser/github-owners-bot-test-repo/commits/' +
            'c7fdbd7f947fca608b20006da8535af5384ab699/check-runs'
        )
        .reply(200, checkruns35Empty)
        // Test that a check-run is created
        .post(
          '/repos/githubuser/github-owners-bot-test-repo/check-runs',
          body => {
            expect(body).toMatchObject({
              name: 'ampproject/owners-check',
              head_sha: opened36.pull_request.head.sha,
              status: 'completed',
              conclusion: 'success',
              output: {
                title: 'All files in this PR have OWNERS approval',
                summary: 'All files in this PR have OWNERS approval',
              },
            });
            expect(body.output.text).toContain(
              '### Current Coverage\n\n- dir2/new-file.txt _(githubuser)_'
            );
            expect(body.output.text).toContain('HELP TEXT');

            return true;
          }
        )
        .reply(200);

      await probot.receive({name: 'pull_request', payload: opened36});
    });
  });

  describe('pull request review', () => {
    test('triggers pull request re-evaluation', async () => {
      expect.assertions(3);
      nock('https://api.github.com')
        .get('/repos/githubuser/github-owners-bot-test-repo/pulls/35')
        .reply(200, pullRequest35)
        // We need the list of files on a pull request to evaluate the required
        // reviewers.
        .get(
          '/repos/githubuser/github-owners-bot-test-repo/pulls/35/files?per_page=100'
        )
        .reply(200, files35)
        // We need the reviews to check if a pull request has been approved or
        // not.
        .get(
          '/repos/githubuser/github-owners-bot-test-repo/pulls/35/reviews?per_page=100'
        )
        .reply(200, reviews35Approved)
        .get(
          '/repos/githubuser/github-owners-bot-test-repo/commits/' +
            '9272f18514cbd3fa935b3ced62ae1c2bf6efa76d/check-runs'
        )
        .reply(200, checkruns35Empty)
        // Test that a check-run is created
        .post(
          '/repos/githubuser/github-owners-bot-test-repo/check-runs',
          body => {
            expect(body).toMatchObject({
              name: 'ampproject/owners-check',
              head_sha: opened35.pull_request.head.sha,
              status: 'completed',
              conclusion: 'success',
              output: {
                title: 'All files in this PR have OWNERS approval',
                summary: 'All files in this PR have OWNERS approval',
              },
            });
            expect(body.output.text).toContain(
              '### Current Coverage\n\n' +
                '- dir2/dir1/dir1/file.txt _(githubuser)_'
            );
            expect(body.output.text).toContain('HELP TEXT');

            return true;
          }
        )
        .reply(200);

      await probot.receive({name: 'pull_request_review', payload: review35});
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
    ])('updates the team members on event %p', async (name, done) => {
      nock('https://api.github.com')
        .get('/teams/42/members?per_page=100')
        .reply(200, [{login: 'coder'}]);

      await probot.receive({
        name,
        payload: {
          team: {id: 42, slug: 'my-team'},
        },
      });
      sandbox.assert.calledOnce(Team.prototype.fetchMembers);
      done();
    });
  });

  describe('PRs that should not assign reviewers right away', () => {
    beforeEach(() => {
      sandbox.stub(OwnersBot.prototype, 'runOwnersCheck').callThrough();
    });

    it('does not assign reviewers for draft PRs', async () => {
      expect.assertions(1);

      nock('https://api.github.com')
        .get(
          '/repos/githubuser/github-owners-bot-test-repo/pulls/25408/files?per_page=100'
        )
        .reply(200, [])
        .get(
          '/repos/githubuser/github-owners-bot-test-repo/pulls/25408/reviews?per_page=100'
        )
        .reply(200, [])
        .get(
          '/repos/githubuser/github-owners-bot-test-repo/commits/' +
            '85c9482fb0e92d0e7b0c4765308a6a1a37eeb708/check-runs'
        )
        .reply(200, checkruns35Empty)
        .post('/repos/githubuser/github-owners-bot-test-repo/check-runs')
        .reply(200);

      await probot.receive({
        name: 'pull_request.opened',
        payload: openedDraft25408,
      });

      sandbox.assert.calledOnce(OwnersBot.prototype.runOwnersCheck);
      expect(OwnersBot.prototype.runOwnersCheck.getCall(0).args[2]).toBe(false);
    });

    it('does assign reviewers for draft PRs once they are ready', async () => {
      expect.assertions(1);

      nock('https://api.github.com')
        .get(
          '/repos/githubuser/github-owners-bot-test-repo/pulls/25408/files?per_page=100'
        )
        .reply(200, [])
        .get(
          '/repos/githubuser/github-owners-bot-test-repo/pulls/25408/reviews?per_page=100'
        )
        .reply(200, [])
        .get(
          '/repos/githubuser/github-owners-bot-test-repo/commits/' +
            '85c9482fb0e92d0e7b0c4765308a6a1a37eeb708/check-runs'
        )
        .reply(200, checkruns35Empty)
        .post('/repos/githubuser/github-owners-bot-test-repo/check-runs')
        .reply(200);

      const payload = getFixture('actions/ready_for_review.25408');
      payload.pull_request.title = 'I am ready now!';
      await probot.receive({
        name: 'pull_request.ready_for_review',
        payload,
      });

      sandbox.assert.calledOnce(OwnersBot.prototype.runOwnersCheck);
      expect(OwnersBot.prototype.runOwnersCheck.getCall(0).args[2]).toBe(true);
    });

    it('does not assign reviewers when the title contains DO NOT SUBMIT', async () => {
      expect.assertions(1);

      nock('https://api.github.com')
        .get(
          '/repos/githubuser/github-owners-bot-test-repo/pulls/35/files?per_page=100'
        )
        .reply(200, [])
        .get(
          '/repos/githubuser/github-owners-bot-test-repo/pulls/35/reviews?per_page=100'
        )
        .reply(200, [])
        .get(
          '/repos/githubuser/github-owners-bot-test-repo/commits/' +
            '9272f18514cbd3fa935b3ced62ae1c2bf6efa76d/check-runs'
        )
        .reply(200, checkruns35Empty)
        .post('/repos/githubuser/github-owners-bot-test-repo/check-runs')
        .reply(200);

      const payload = getFixture('actions/opened.35');
      payload.pull_request.title = 'DO NOT SUBMIT: test';
      await probot.receive({
        name: 'pull_request.opened',
        payload,
      });

      sandbox.assert.calledOnce(OwnersBot.prototype.runOwnersCheck);
      expect(OwnersBot.prototype.runOwnersCheck.getCall(0).args[2]).toBe(false);
    });

    it('does not assign reviewers when the title contains WIP', async () => {
      expect.assertions(1);

      nock('https://api.github.com')
        .get(
          '/repos/githubuser/github-owners-bot-test-repo/pulls/35/files?per_page=100'
        )
        .reply(200, [])
        .get(
          '/repos/githubuser/github-owners-bot-test-repo/pulls/35/reviews?per_page=100'
        )
        .reply(200, [])
        .get(
          '/repos/githubuser/github-owners-bot-test-repo/commits/' +
            '9272f18514cbd3fa935b3ced62ae1c2bf6efa76d/check-runs'
        )
        .reply(200, checkruns35Empty)
        .post('/repos/githubuser/github-owners-bot-test-repo/check-runs')
        .reply(200);

      const payload = getFixture('actions/opened.35');
      payload.pull_request.title = 'WIP: test';
      await probot.receive({
        name: 'pull_request.opened',
        payload,
      });

      sandbox.assert.calledOnce(OwnersBot.prototype.runOwnersCheck);
      expect(OwnersBot.prototype.runOwnersCheck.getCall(0).args[2]).toBe(false);
    });
  });

  describe('closed PRs', () => {
    let pullRequest;
    let payload;

    beforeEach(() => {
      sandbox.stub(OwnersBot.prototype, 'refreshTree');
      pullRequest = require('./fixtures/pulls/pull_request.35');
      payload = {pull_request: pullRequest};
    });

    it('does nothing for a non-merged PR', async done => {
      pullRequest.merged = false;
      await probot.receive({name: 'pull_request.closed', payload});

      sandbox.assert.notCalled(OwnersBot.prototype.refreshTree);
      done();
    });

    describe('merged PRs', () => {
      beforeEach(() => {
        pullRequest.merged = true;
      });

      it('does nothing for a PR without owners files', async done => {
        nock('https://api.github.com')
          .get(
            '/repos/githubuser/github-owners-bot-test-repo/pulls/35/files?per_page=100'
          )
          .reply(200, [{filename: 'foo.txt', sha: ''}]);
        await probot.receive({name: 'pull_request.closed', payload});

        sandbox.assert.notCalled(OwnersBot.prototype.refreshTree);
        done();
      });

      it('refreshes the owners tree for a PR with owners files', async done => {
        nock('https://api.github.com')
          .get(
            '/repos/githubuser/github-owners-bot-test-repo/pulls/35/files?per_page=100'
          )
          .reply(200, [{filename: 'OWNERS', sha: ''}]);
        await probot.receive({name: 'pull_request.closed', payload});

        sandbox.assert.calledOnce(OwnersBot.prototype.refreshTree);
        done();
      });
    });
  });
});
