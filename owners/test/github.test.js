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

const nock = require('nock');
const sinon = require('sinon');
const {Probot} = require('probot');
const owners = require('..');
const {OwnersBot} = require('../src/owners_bot');
const {CheckRun, CheckRunConclusion} = require('../src/owners_check');
const {GitHub, PullRequest, Review, Team} = require('../src/github');

const reviewsApprovedResponse = require('./fixtures/reviews/reviews.35.approved.json');
const requestedReviewsResponse = require('./fixtures/reviews/requested_reviewers.24574.json');
const pullRequestResponse = require('./fixtures/pulls/pull_request.35.json');
const listFilesResponse = require('./fixtures/files/files.35.json');
const checkRunsListResponse = require('./fixtures/check-runs/check-runs.get.35.multiple');
const checkRunsEmptyResponse = require('./fixtures/check-runs/check-runs.get.35.empty');
const getFileResponse = require('./fixtures/files/file_blob.24523.json');

nock.disableNetConnect();

describe('pull request', () => {
  describe('fromGitHubResponse', () => {
    it('creates a pull request instance', () => {
      const response = pullRequestResponse;
      const pr = PullRequest.fromGitHubResponse(response);

      expect(pr.number).toEqual(35);
      expect(pr.author).toEqual('ampprojectbot');
      expect(pr.headSha).toEqual('9272f18514cbd3fa935b3ced62ae1c2bf6efa76d');
    });
  });
});

describe('review', () => {
  it('initializes its approval state', () => {
    const timestamp = new Date('2019-01-01T00:00:00Z');
    const approval = new Review('a_user', 'APPROVED', timestamp);
    const rejection = new Review('a_user', 'CHANGES_REQUESTED', timestamp);

    expect(approval.reviewer).toEqual('a_user');
    expect(approval.submittedAt).toEqual(timestamp);
    expect(approval.isApproved).toBe(true);
    expect(rejection.isApproved).toBe(false);
  });
});

describe('team', () => {
  describe('toString', () => {
    it('prefixes the slug with the orginazation', () => {
      const team = new Team(1337, 'ampproject', 'my_team');
      expect(team.toString()).toEqual('ampproject/my_team');
    });
  });

  describe('getMembers', () => {
    let sandbox;
    let team;
    const fakeGithub = {getTeamMembers: id => ['rcebulko', 'erwinmombay']};

    beforeEach(() => {
      sandbox = sinon.createSandbox();
      sandbox.stub(fakeGithub, 'getTeamMembers').callThrough();
      team = new Team(1337, 'ampproject', 'my_team');
    });

    afterEach(() => {
      sandbox.restore();
    });

    it('fetches team members from GitHub', async () => {
      expect.assertions(1);
      await team.fetchMembers(fakeGithub);

      sandbox.assert.calledWith(fakeGithub.getTeamMembers, 1337);
      expect(team.members).toEqual(['rcebulko', 'erwinmombay']);
    });
  });
});

describe('GitHub API', () => {
  let probot;
  let app;
  let sandbox;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    sandbox.stub(OwnersBot.prototype, 'initTeams');
    probot = new Probot({});
    app = probot.load(owners);

    app.app = () => 'test';
  });

  afterEach(() => {
    sandbox.restore();
  });

  /**
   * A test function which uses a Probot context and/or its GitHub API.
   *
   * @callback contextFn
   * @param {!Context} context Probot context.
   * @param {!GitHub} github GitHub API interface.
   */

  /**
   * Executes a function with a probot context and GitHub API interface.
   *
   * Wraps the function call in a fake Probot event handler and stubs out the
   * context with the `test_owner/test_repo` repository.
   *
   * @param {contextFn} testFn test function.
   * @return {function} the test function wrapped in a Probot context.
   */
  function withContext(testFn) {
    return async () => {
      app.on('test_event', async context => {
        sandbox.stub(context, 'repo').returns({
          repo: 'test_repo',
          owner: 'test_owner',
        });
        await testFn(context, GitHub.fromContext(context));
      });
      await probot.receive({name: 'test_event', payload: {}});
    };
  }

  describe('fromContext', () => {
    it(
      'initializes a GitHub API interface',
      withContext(context => {
        const github = GitHub.fromContext(context);

        expect(github.client).toBe(context.github);
        expect(github.owner).toEqual('test_owner');
        expect(github.repository).toEqual('test_repo');
        expect(github.logger).toBe(context.log);
      })
    );
  });

  describe('repo', () => {
    it(
      'returns the repo and owner',
      withContext((context, github) => {
        const repoInfo = github.repo();

        expect(repoInfo.owner).toEqual('test_owner');
        expect(repoInfo.repo).toEqual('test_repo');
      })
    );

    it(
      'sets the repo and owner on an object',
      withContext((context, github) => {
        const repoInfo = github.repo({key: 'value', owner: 'old_owner'});

        expect(repoInfo.key).toEqual('value');
        expect(repoInfo.owner).toEqual('test_owner');
      })
    );
  });

  describe('customRequest', () => {
    beforeEach(() => {
      sandbox.stub(process, 'env').value({GITHUB_ACCESS_TOKEN: '_TOKEN_'});
    });

    it('returns the response', async () => {
      expect.assertions(1);
      nock('https://api.github.com')
        .get('/api/endpoint')
        .reply(200, '_DATA_');

      await withContext(async (context, github) => {
        const responseData = await github._customRequest('/api/endpoint');
        expect(responseData.data).toEqual('_DATA_');
      })();
    });

    it('adds the preview header', async () => {
      expect.assertions(1);
      nock('https://api.github.com')
        .get('/api/endpoint')
        .reply(200, function() {
          // Note: it is important this use `function` syntax (instead of arrow
          // syntax `() => {}` because it needs to access `this`.
          // eslint-disable-next-line no-invalid-this
          expect(this.req.headers.accept[0]).toContain(
            'application/vnd.github.hellcat-preview+json'
          );
        });

      await withContext(async (context, github) => {
        await github._customRequest('/api/endpoint');
      })();
    });
  });

  describe('getTeams', () => {
    it('returns a list of team objects', async () => {
      expect.assertions(3);
      nock('https://api.github.com')
        .get('/orgs/test_owner/teams?page=0')
        .reply(200, [{id: 1337, slug: 'my_team'}]);

      await withContext(async (context, github) => {
        const teams = await github.getTeams();

        expect(teams[0].id).toEqual(1337);
        expect(teams[0].org).toEqual('test_owner');
        expect(teams[0].slug).toEqual('my_team');
      })();
    });

    it('pages automatically', async () => {
      expect.assertions(1);
      nock('https://api.github.com')
        .get('/orgs/test_owner/teams?page=0')
        .reply(200, Array(30).fill([{id: 1337, slug: 'my_team'}]), {
          link: '<https://api.github.com/blah/blah?page=2>; rel="next"',
        });
      nock('https://api.github.com')
        .get('/orgs/test_owner/teams?page=1')
        .reply(200, Array(10).fill([{id: 1337, slug: 'my_team'}]));

      await withContext(async (context, github) => {
        const teams = await github.getTeams();

        expect(teams.length).toEqual(40);
      })();
    });
  });

  describe('getTeamMembers', () => {
    it('returns a list of team objects', async () => {
      expect.assertions(1);
      nock('https://api.github.com')
        .get('/teams/1337/members')
        .reply(200, [{login: 'rcebulko'}, {login: 'erwinmombay'}]);

      await withContext(async (context, github) => {
        const members = await github.getTeamMembers(1337);

        expect(members).toEqual(['rcebulko', 'erwinmombay']);
      })();
    });
  });

  describe('getPullRequest', () => {
    it('fetches a pull request', async () => {
      expect.assertions(2);
      nock('https://api.github.com')
        .get('/repos/test_owner/test_repo/pulls/35')
        .reply(200, pullRequestResponse);

      await withContext(async (context, github) => {
        const pr = await github.getPullRequest(35);

        // Author pulled from pull_request.35.json
        expect(pr.author).toEqual('ampprojectbot');
        expect(pr.number).toEqual(35);
      })();
    });
  });

  describe('getReviews', () => {
    it('fetches a list of reviews', async () => {
      expect.assertions(3);
      nock('https://api.github.com')
        .get('/repos/test_owner/test_repo/pulls/35/reviews')
        .reply(200, reviewsApprovedResponse);

      await withContext(async (context, github) => {
        const [review] = await github.getReviews(35);

        expect(review.reviewer).toEqual('erwinmombay');
        expect(review.isApproved).toBe(true);
        expect(review.submittedAt).toEqual(new Date('2019-02-26T20:39:13Z'));
      })();
    });
  });

  describe('createReviewRequests', () => {
    it('requests reviews from GitHub users', async () => {
      expect.assertions(1);
      nock('https://api.github.com')
        .post(
          '/repos/test_owner/test_repo/pulls/24574/requested_reviewers',
          body => {
            expect(body).toMatchObject({reviewers: ['reviewer']});
            return true;
          }
        )
        .reply(200);

      await withContext(async (context, github) => {
        await github.createReviewRequests(24574, ['reviewer']);
      })();
    });

    it('skips the API call if no usernames are provided', async () => {
      expect.assertions(1);

      await withContext(async (context, github) => {
        // This will fail if it attempts to make an un-nocked network request.
        await github.createReviewRequests(24574, []);

        // Ensures the test fails if the assertion is never run.
        expect(true).toBe(true);
      })();
    });
  });

  describe('getReviewRequests', () => {
    it('fetches a list of review requests', async () => {
      expect.assertions(1);
      nock('https://api.github.com')
        .get('/repos/test_owner/test_repo/pulls/24574/requested_reviewers')
        .reply(200, requestedReviewsResponse);

      await withContext(async (context, github) => {
        const reviewers = await github.getReviewRequests(24574);

        expect(reviewers).toEqual(['jridgewell', 'jpettitt', 'sparhami']);
      })();
    });
  });

  describe('getFileContents', () => {
    it('fetches the contents of a file', async () => {
      expect.assertions(1);
      nock('https://api.github.com')
        .get(
          '/repos/test_owner/test_repo/git/blobs/eeae1593f4ecbae3f4453c9ceee2940a0e98ddca'
        )
        .reply(200, getFileResponse);

      await withContext(async (context, github) => {
        const contents = await github.getFileContents({
          filename: 'third_party/subscriptions-project/OWNERS.yaml',
          sha: 'eeae1593f4ecbae3f4453c9ceee2940a0e98ddca',
        });

        expect(contents).toEqual(
          '- chenshay\n- chrisantaki\n- dparikh\n- dvoytenko\n- jpettitt\n'
        );
      })();
    });
  });

  describe('listFiles', () => {
    it('fetches the list of changed files', async () => {
      expect.assertions(1);
      nock('https://api.github.com')
        .get('/repos/test_owner/test_repo/pulls/35/files')
        .reply(200, listFilesResponse);

      await withContext(async (context, github) => {
        const [file] = await github.listFiles(35);

        expect(file).toMatchObject({
          filename: 'dir2/dir1/dir1/file.txt',
          sha: 'eeae1593f4ecbae3f4453c9ceee2940a0e98ddca',
        });
      })();
    });
  });

  describe('createCheckRun', () => {
    it('creates a check-run for the commit', async () => {
      expect.assertions(1);
      nock('https://api.github.com')
        .post('/repos/test_owner/test_repo/check-runs', body => {
          expect(body).toMatchObject({
            head_sha: '_test_hash_',
            name: 'ampproject/owners-check',
            status: 'completed',
            conclusion: 'neutral',
            output: {
              title: 'Test summary',
              summary: 'Test summary',
              text: 'Test text',
            },
          });
          return true;
        })
        .reply(200);

      await withContext(async (context, github) => {
        await github.createCheckRun(
          '_test_hash_',
          new CheckRun(CheckRunConclusion.NEUTRAL, 'Test summary', 'Test text')
        );
      })();
    });
  });

  describe('getCheckRunIds', () => {
    it('fetches the first matching check-run from the list', async () => {
      expect.assertions(2);
      const sha = '9272f18514cbd3fa935b3ced62ae1c2bf6efa76d';
      nock('https://api.github.com')
        .get(`/repos/test_owner/test_repo/commits/${sha}/check-runs`)
        .reply(200, checkRunsListResponse);

      await withContext(async (context, github) => {
        const checkRunIds = await github.getCheckRunIds(sha);

        // ID pulled from check-runs.get.35.multiple
        expect(checkRunIds['owners-check']).toEqual(53472315);
        expect(checkRunIds['another-check']).toEqual(53472313);
      })();
    });

    it('returns null if the list has no matching check-run', async () => {
      expect.assertions(1);
      nock('https://api.github.com')
        .get('/repos/test_owner/test_repo/commits/_missing_hash_/check-runs')
        .reply(200, checkRunsListResponse);

      await withContext(async (context, github) => {
        const checkRunIds = await github.getCheckRunIds('_missing_hash_');

        expect(checkRunIds['owners-check']).toBeUndefined();
      })();
    });

    it('returns null if the list is empty', async () => {
      expect.assertions(1);
      nock('https://api.github.com')
        .get('/repos/test_owner/test_repo/commits/_test_hash_/check-runs')
        .reply(200, checkRunsEmptyResponse);

      await withContext(async (context, github) => {
        const checkRunIds = await github.getCheckRunIds('_test_hash_');

        expect(checkRunIds['owners-check']).toBeUndefined();
      })();
    });

    it('returns null if there is an error querying GitHub', async () => {
      expect.assertions(1);
      nock('https://api.github.com')
        .get('/repos/test_owner/test_repo/commits/_test_hash_/check-runs')
        .replyWithError({
          message: 'Not found',
          code: 404,
        });

      await withContext(async (context, github) => {
        const checkRunIds = await github.getCheckRunIds('_test_hash_');

        expect(checkRunIds['owners-check']).toBeUndefined();
      })();
    });
  });

  describe('updateCheckRun', () => {
    it('updates a check-run by ID', async () => {
      expect.assertions(1);
      nock('https://api.github.com')
        .patch('/repos/test_owner/test_repo/check-runs/1337', body => {
          expect(body).toMatchObject({
            name: 'ampproject/owners-check',
            status: 'completed',
            conclusion: 'neutral',
            output: {
              title: 'Test summary',
              summary: 'Test summary',
              text: 'Test text',
            },
          });
          return true;
        })
        .reply(200);

      await withContext(async (context, github) => {
        await github.updateCheckRun(
          1337,
          new CheckRun(CheckRunConclusion.NEUTRAL, 'Test summary', 'Test text')
        );
      })();
    });
  });
});
