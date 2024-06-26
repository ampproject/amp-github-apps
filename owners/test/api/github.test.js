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

const {CheckRun, CheckRunState} = require('../../src/ownership/owners_check');
const {GitHub, PullRequest, Review, Team} = require('../../src/api/github');

const checkRunsEmptyResponse = require('../fixtures/check-runs/check-runs.get.35.empty');
const checkRunsListResponse = require('../fixtures/check-runs/check-runs.get.35.multiple');
const commentReviewsResponse = require('../fixtures/reviews/comment_reviews.24686.json');
const getFileResponse = require('../fixtures/files/file_blob.24523.json');
const listFilesResponse = require('../fixtures/files/files.35.json');
const pullRequestResponse = require('../fixtures/pulls/pull_request.35.json');
const requestedReviewsResponse = require('../fixtures/reviews/requested_reviewers.24574.json');
const reviewsApprovedResponse = require('../fixtures/reviews/reviews.35.approved.json');
const searchReadmeResponse = require('../fixtures/files/search.readme.json');

describe('pull request', () => {
  describe('isOpen', () => {
    it.each([
      ['open', true],
      ['closed', false],
      ['merged', false],
    ])('with status %p returns %p', (state, result) => {
      const pr = new PullRequest(0, '', '', '', state);
      expect(pr.isOpen).toBe(result);
    });
  });

  describe('fromGitHubResponse', () => {
    it('creates a pull request instance', () => {
      const response = pullRequestResponse;
      const pr = PullRequest.fromGitHubResponse(response);

      expect(pr.number).toEqual(35);
      expect(pr.author).toEqual('ampprojectbot');
      expect(pr.headSha).toEqual('9272f18514cbd3fa935b3ced62ae1c2bf6efa76d');
      expect(pr.description).toEqual('Pull request description');
      expect(pr.state).toEqual('open');
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
      const team = new Team('ampproject', 'my_team');
      expect(team.toString()).toEqual('ampproject/my_team');
    });
  });

  describe('getMembers', () => {
    let sandbox;
    let team;
    const fakeGithub = {getTeamMembers: unusedTeam => ['coder', 'githubuser']};

    beforeEach(() => {
      sandbox = sinon.createSandbox();
      sandbox.stub(fakeGithub, 'getTeamMembers').callThrough();
      team = new Team('ampproject', 'my_team');
    });

    afterEach(() => {
      sandbox.restore();
    });

    it('fetches team members from GitHub', async () => {
      expect.assertions(1);
      await team.fetchMembers(fakeGithub);

      sandbox.assert.calledWith(fakeGithub.getTeamMembers, team);
      expect(team.members).toEqual(['coder', 'githubuser']);
    });
  });
});

describe('GitHub API', () => {
  const sandbox = sinon.createSandbox();
  let mockGithubClient;
  let github;

  beforeEach(() => {
    sandbox.stub(console);
    sandbox.stub(CheckRun.prototype, 'helpText').value('HELP TEXT');

    mockGithubClient = {
      checks: {
        create: jest.fn(),
        listForRef: jest.fn(),
        update: jest.fn(),
      },
      issues: {
        listComments: jest.fn(),
      },
      pulls: {
        get: jest.fn(),
        listFiles: jest.fn(),
        listRequestedReviewers: jest.fn(),
        listReviews: jest.fn(),
        requestReviewers: jest.fn(),
      },
      repos: {
        getContent: jest.fn(),
      },
      request: jest.fn(),
      search: {
        code: jest.fn(),
      },
      teams: {
        list: jest.fn(),
        listMembersInOrg: jest.fn(),
      },
    };
    github = new GitHub(mockGithubClient, 'test_owner', 'test_repo', console);
    // To mock pagination we simply call through to the (also mocked) method.
    // Mocking an internal method of the unit-under-test is an anti-pattern, but
    // this is part of the migration to using Jest mocks instead of Nock.
    // TODO(@danielrozenberg): fix this!
    github._paginate = async (method, ...args) => {
      const response = await method(...args);
      return response.items || response.data;
    };
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe('fromContext', () => {
    it('initializes a GitHub API interface', () => {
      const logStub = sandbox.stub();
      const github = GitHub.fromContext({
        repo: () => {
          return {repo: 'test_repo', owner: 'test_owner'};
        },
        octokit: mockGithubClient,
        log: logStub,
      });

      expect(github.client).toBe(mockGithubClient);
      expect(github.owner).toEqual('test_owner');
      expect(github.repository).toEqual('test_repo');
      expect(github.logger).toBe(logStub);
    });
  });

  describe('repo', () => {
    it('returns the repo and owner', () => {
      const repoInfo = github.repo();

      expect(repoInfo.owner).toEqual('test_owner');
      expect(repoInfo.repo).toEqual('test_repo');
    });

    it('sets the repo and owner on an object', () => {
      const repoInfo = github.repo({key: 'value', owner: 'old_owner'});

      expect(repoInfo.key).toEqual('value');
      expect(repoInfo.owner).toEqual('test_owner');
    });
  });

  describe('customRequest', () => {
    beforeEach(() => {
      sandbox.stub(process, 'env').value({
        NODE_ENV: 'test',
      });
    });

    it('returns the response', async () => {
      mockGithubClient.request.mockResolvedValue({data: '_DATA_'});

      const response = await github._customRequest('GET', '/api/endpoint');

      expect(mockGithubClient.request).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'GET',
          url: '/api/endpoint',
        })
      );
      expect(response.data).toEqual('_DATA_');
    });

    it('includes POST data', async () => {
      mockGithubClient.request.mockResolvedValue({data: null});

      await github._customRequest('POST', '/api/endpoint', {body: 'BODY'});

      expect(mockGithubClient.request).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'POST',
          url: '/api/endpoint',
          body: 'BODY',
        })
      );
    });

    it('adds the preview header', async () => {
      mockGithubClient.request.mockResolvedValue({data: null});

      await github._customRequest('GET', '/api/endpoint');

      expect(mockGithubClient.request).toHaveBeenCalledWith(
        expect.objectContaining({
          headers: expect.objectContaining({
            accept: 'application/vnd.github.hellcat-preview+json',
          }),
        })
      );
    });
  });

  describe('getTeams', () => {
    it('returns a list of team objects', async () => {
      mockGithubClient.teams.list.mockResolvedValue({
        data: [{slug: 'my_team'}],
      });

      const teams = await github.getTeams();

      expect(mockGithubClient.teams.list).toHaveBeenCalledWith({
        org: 'test_owner',
      });
      expect(teams[0].org).toEqual('test_owner');
      expect(teams[0].slug).toEqual('my_team');
    });
  });

  describe('getTeamMembers', () => {
    it('returns a list of team objects', async () => {
      mockGithubClient.teams.listMembersInOrg.mockResolvedValue({
        data: [{login: 'coder'}, {login: 'githubuser'}],
      });

      const team = new Team('test_owner', 'my_team');
      const members = await github.getTeamMembers(team);

      expect(mockGithubClient.teams.listMembersInOrg).toHaveBeenCalledWith({
        org: 'test_owner',
        'team_slug': 'my_team',
      });
      expect(members).toEqual(['coder', 'githubuser']);
    });
  });

  describe('getPullRequest', () => {
    it('fetches a pull request', async () => {
      mockGithubClient.pulls.get.mockResolvedValue({
        data: pullRequestResponse,
      });

      const pr = await github.getPullRequest(35);

      expect(mockGithubClient.pulls.get).toHaveBeenCalledWith({
        owner: 'test_owner',
        repo: 'test_repo',
        'pull_number': 35,
      });
      // Author pulled from pull_request.35.json
      expect(pr.author).toEqual('ampprojectbot');
      expect(pr.number).toEqual(35);
    });
  });

  describe('getReviews', () => {
    it('fetches a list of reviews', async () => {
      mockGithubClient.pulls.listReviews.mockResolvedValue({
        data: reviewsApprovedResponse,
      });

      const [review] = await github.getReviews(35);

      expect(mockGithubClient.pulls.listReviews).toHaveBeenCalledWith({
        owner: 'test_owner',
        repo: 'test_repo',
        'pull_number': 35,
      });
      expect(review.reviewer).toEqual('githubuser');
      expect(review.isApproved).toBe(true);
      expect(review.submittedAt).toEqual(new Date('2019-02-26T20:39:13Z'));
    });

    it('returns approvals', async () => {
      mockGithubClient.pulls.listReviews.mockResolvedValue({
        data: commentReviewsResponse,
      });

      const reviews = await github.getReviews(24686);
      const review = reviews[0];

      expect(review.reviewer).toEqual('rsimha');
      expect(review.isApproved).toBe(true);
    });

    it('returns post-review comments', async () => {
      mockGithubClient.pulls.listReviews.mockResolvedValue({
        data: commentReviewsResponse,
      });

      const reviews = await github.getReviews(24686);
      const review = reviews[1];

      expect(review.reviewer).toEqual('rsimha');
      expect(review.isComment).toBe(true);
    });

    it('returns pre-review comments', async () => {
      mockGithubClient.pulls.listReviews.mockResolvedValue({
        data: commentReviewsResponse,
      });

      const reviews = await github.getReviews(24686);
      const review = reviews[2];

      expect(review.reviewer).toEqual('fakename');
      expect(review.isComment).toBe(true);
    });

    it('returns rejections', async () => {
      mockGithubClient.pulls.listReviews.mockResolvedValue({
        data: commentReviewsResponse,
      });

      const reviews = await github.getReviews(24686);
      const review = reviews[3];

      expect(review.reviewer).toEqual('fakename');
      expect(review.isRejected).toBe(true);
    });

    it('returns comment-only reviews', async () => {
      mockGithubClient.pulls.listReviews.mockResolvedValue({
        data: commentReviewsResponse,
      });

      const reviews = await github.getReviews(24686);
      const review = reviews[4];

      expect(review.reviewer).toEqual('coder');
      expect(review.isComment).toBe(true);
    });

    it('ignores irrelevant review states', async () => {
      mockGithubClient.pulls.listReviews.mockResolvedValue({
        data: commentReviewsResponse,
      });

      const reviews = await github.getReviews(24686);
      const review = reviews[5];

      expect(review).toBeUndefined();
    });
  });

  describe('getReviewRequests', () => {
    it('fetches a list of review requests', async () => {
      mockGithubClient.pulls.listRequestedReviewers.mockResolvedValue({
        data: requestedReviewsResponse,
      });

      const reviewers = await github.getReviewRequests(24574);

      expect(
        mockGithubClient.pulls.listRequestedReviewers
      ).toHaveBeenCalledWith({
        owner: 'test_owner',
        repo: 'test_repo',
        'pull_number': 24574,
      });
      expect(reviewers).toEqual(['scripter', 'someperson', 'birdperson']);
    });
  });

  describe('getFileContents', () => {
    it('fetches the contents of a file', async () => {
      mockGithubClient.repos.getContent.mockResolvedValue({
        data: getFileResponse,
      });

      const {contents} = await github.getFileContents(
        'third_party/subscriptions-project/OWNERS'
      );

      expect(mockGithubClient.repos.getContent).toHaveBeenCalledWith({
        owner: 'test_owner',
        repo: 'test_repo',
        path: 'third_party/subscriptions-project/OWNERS',
      });
      expect(contents).toEqual(
        '- otherperson\n- auser\n- otheruser\n- programmer\n- someperson\n'
      );
    });
  });

  describe('listFiles', () => {
    it('fetches the list of changed files', async () => {
      mockGithubClient.pulls.listFiles.mockResolvedValue({
        data: listFilesResponse,
      });

      const files = await github.listFiles(35);

      expect(mockGithubClient.pulls.listFiles).toHaveBeenCalledWith({
        owner: 'test_owner',
        repo: 'test_repo',
        'pull_number': 35,
      });
      expect(files.length).toBe(1);
      expect(files[0]).toEqual('dir2/dir1/dir1/file.txt');
    });
  });

  describe('searchCode', () => {
    it('fetches the list of matching files', async () => {
      mockGithubClient.search.code.mockResolvedValue(searchReadmeResponse);

      const files = await github.searchFilename('README.md');

      expect(mockGithubClient.search.code).toHaveBeenCalledWith({
        q: 'filename:README.md repo:test_owner/test_repo',
      });
      expect(files.length).toEqual(23);
    });

    it('only includes exact file matches', async () => {
      mockGithubClient.search.code.mockResolvedValue({
        'total_count': 3,
        items: [
          {name: 'not-exact-match', path: 'foo/not-exact-match', sha: ''},
          {name: 'exact-match', path: 'foo/exact-match', sha: ''},
          {name: 'exact-match', path: 'exact-match', sha: ''},
        ],
      });

      const files = await github.searchFilename('exact-match');
      const filenames = files.map(({filename}) => filename);

      expect(mockGithubClient.search.code).toHaveBeenCalledWith({
        q: 'filename:exact-match repo:test_owner/test_repo',
      });
      expect(filenames).not.toContainEqual('foo/not-exact-match');
      expect(filenames).toContainEqual('foo/exact-match');
      expect(filenames).toContainEqual('exact-match');
    });
  });

  describe('createCheckRun', () => {
    it('creates a check-run for the commit', async () => {
      mockGithubClient.checks.create.mockResolvedValue();

      const checkRun = new CheckRun(
        CheckRunState.NEUTRAL,
        'Test summary',
        'Test text'
      );
      await github.createCheckRun('_test_hash_', checkRun);

      expect(mockGithubClient.checks.create).toHaveBeenCalledWith({
        'head_sha': '_test_hash_',
        'completed_at': expect.any(Date),
        owner: 'test_owner',
        repo: 'test_repo',
        name: 'ampproject/owners-check',
        status: 'completed',
        conclusion: 'neutral',
        output: {
          title: 'Test summary',
          summary: 'Test summary',
          text: 'Test text\n\nHELP TEXT',
        },
      });
    });
  });

  describe('getCheckRunIds', () => {
    it('fetches the first matching check-run from the list', async () => {
      mockGithubClient.checks.listForRef.mockResolvedValue({
        data: checkRunsListResponse,
      });

      const sha = '9272f18514cbd3fa935b3ced62ae1c2bf6efa76d';
      const checkRunIds = await github.getCheckRunIds(sha);

      expect(mockGithubClient.checks.listForRef).toHaveBeenCalledWith({
        owner: 'test_owner',
        repo: 'test_repo',
        ref: sha,
      });

      // ID pulled from check-runs.get.35.multiple
      expect(checkRunIds['owners-check']).toEqual(53472315);
      expect(checkRunIds['another-check']).toEqual(53472313);
    });

    it('returns null if the list has no matching check-run', async () => {
      mockGithubClient.checks.listForRef.mockResolvedValue({
        data: checkRunsListResponse,
      });

      const checkRunIds = await github.getCheckRunIds('_missing_hash_');

      expect(mockGithubClient.checks.listForRef).toHaveBeenCalledWith({
        owner: 'test_owner',
        repo: 'test_repo',
        ref: '_missing_hash_',
      });
      expect(checkRunIds['owners-check']).toBeUndefined();
    });

    it('returns null if the list is empty', async () => {
      mockGithubClient.checks.listForRef.mockResolvedValue({
        data: checkRunsEmptyResponse,
      });

      const checkRunIds = await github.getCheckRunIds('_test_hash_');

      expect(mockGithubClient.checks.listForRef).toHaveBeenCalledWith({
        owner: 'test_owner',
        repo: 'test_repo',
        ref: '_test_hash_',
      });
      expect(checkRunIds['owners-check']).toBeUndefined();
    });

    it('returns null if there is an error querying GitHub', async () => {
      mockGithubClient.checks.listForRef.mockRejectedValue(
        new Error('RequestError', '404 Not Found')
      );

      const checkRunIds = await github.getCheckRunIds('_test_hash_');

      expect(mockGithubClient.checks.listForRef).toHaveBeenCalledWith({
        owner: 'test_owner',
        repo: 'test_repo',
        ref: '_test_hash_',
      });
      expect(checkRunIds['owners-check']).toBeUndefined();
    });
  });

  describe('updateCheckRun', () => {
    it('updates a check-run by ID', async () => {
      mockGithubClient.checks.update.mockResolvedValue({});
      const checkRun = new CheckRun(
        CheckRunState.NEUTRAL,
        'Test summary',
        'Test text'
      );
      await github.updateCheckRun(1337, checkRun);

      expect(mockGithubClient.checks.update).toHaveBeenCalledWith({
        'check_run_id': 1337,
        'completed_at': expect.any(Date),
        owner: 'test_owner',
        repo: 'test_repo',
        name: 'ampproject/owners-check',
        status: 'completed',
        conclusion: 'neutral',
        output: {
          title: 'Test summary',
          summary: 'Test summary',
          text: 'Test text\n\nHELP TEXT',
        },
      });
    });
  });
});
