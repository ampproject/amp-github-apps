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
const Octokit = require('@octokit/rest');

const {CheckRun, CheckRunState} = require('../../src/owners_check');
const {GitHub, PullRequest, Review, Team} = require('../../src/api/github');

const reviewsApprovedResponse = require('../fixtures/reviews/reviews.35.approved.json');
const requestedReviewsResponse = require('../fixtures/reviews/requested_reviewers.24574.json');
const commentReviewsResponse = require('../fixtures/reviews/comment_reviews.24686.json');
const manyReviewsPage1Response = require('../fixtures/reviews/many_reviews.23928.page_1.json');
const manyReviewsPage2Response = require('../fixtures/reviews/many_reviews.23928.page_2.json');
const manyTeamsResponsePage1 = require('../fixtures/teams/many_members.page_1.json');
const manyTeamsResponsePage2 = require('../fixtures/teams/many_members.page_2.json');
const pullRequestResponse = require('../fixtures/pulls/pull_request.35.json');
const issueCommentsResponse = require('../fixtures/comments/issue_comments.438.json');
const listFilesResponsePage1 = require('../fixtures/files/files.35.json');
const listFilesResponsePage2 = require('../fixtures/files/files.35.json');
const checkRunsListResponse = require('../fixtures/check-runs/check-runs.get.35.multiple');
const checkRunsEmptyResponse = require('../fixtures/check-runs/check-runs.get.35.empty');
const getFileResponse = require('../fixtures/files/file_blob.24523.json');
const searchReadmeResponse = require('../fixtures/files/search.readme.json');
const searchOwnersPage1Response = require('../fixtures/files/search.owners.page_1.json');
const searchOwnersPage2Response = require('../fixtures/files/search.owners.page_2.json');

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
      const team = new Team(1337, 'ampproject', 'my_team');
      expect(team.toString()).toEqual('ampproject/my_team');
    });
  });

  describe('getMembers', () => {
    let sandbox;
    let team;
    const fakeGithub = {getTeamMembers: id => ['coder', 'githubuser']};

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
      expect(team.members).toEqual(['coder', 'githubuser']);
    });
  });
});

describe('GitHub API', () => {
  const sandbox = sinon.createSandbox();
  let githubClient;
  let github;

  beforeAll(() => {
    nock.disableNetConnect();
  });

  afterAll(() => {
    nock.enableNetConnect();
  });

  beforeEach(() => {
    sandbox.stub(console);
    sandbox.stub(CheckRun.prototype, 'helpText').value('HELP TEXT');

    githubClient = new Octokit({auth: '_TOKEN_'});
    github = new GitHub(githubClient, 'test_owner', 'test_repo');
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
        github: githubClient,
        log: logStub,
      });

      expect(github.client).toBe(githubClient);
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
      expect.assertions(1);
      nock('https://api.github.com')
        .get('/api/endpoint')
        .reply(200, '_DATA_');

      const response = await github._customRequest('GET', '/api/endpoint');
      expect(response.data).toEqual('_DATA_');
    });

    it('includes POST data', async () => {
      expect.assertions(1);
      nock('https://api.github.com')
        .post('/api/endpoint', body => {
          expect(body).toEqual({body: 'BODY'});
          return true;
        })
        .reply(200);

      await github._customRequest('POST', '/api/endpoint', {body: 'BODY'});
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

      await github._customRequest('GET', '/api/endpoint');
    });
  });

  describe('getTeams', () => {
    it('returns a list of team objects', async () => {
      expect.assertions(3);
      nock('https://api.github.com')
        .get('/orgs/test_owner/teams?per_page=100')
        .reply(200, [{id: 1337, slug: 'my_team'}]);
      const teams = await github.getTeams();

      expect(teams[0].id).toEqual(1337);
      expect(teams[0].org).toEqual('test_owner');
      expect(teams[0].slug).toEqual('my_team');
    });

    it('pages automatically', async () => {
      expect.assertions(1);
      nock('https://api.github.com')
        .get('/orgs/test_owner/teams?per_page=100')
        .reply(200, Array(30).fill([{id: 1337, slug: 'my_team'}]), {
          link:
            '<https://api.github.com/orgs/test_owner/teams?page=2&per_page=100>; rel="next"',
        });
      nock('https://api.github.com')
        .get('/orgs/test_owner/teams?page=2&per_page=100')
        .reply(200, Array(10).fill([{id: 1337, slug: 'my_team'}]));
      const teams = await github.getTeams();

      expect(teams.length).toEqual(40);
    });
  });

  describe('getTeamMembers', () => {
    it('returns a list of team objects', async () => {
      expect.assertions(1);
      nock('https://api.github.com')
        .get('/teams/1337/members?per_page=100')
        .reply(200, [{login: 'coder'}, {login: 'githubuser'}]);
      const members = await github.getTeamMembers(1337);

      expect(members).toEqual(['coder', 'githubuser']);
    });

    it('pages automatically', async () => {
      expect.assertions(1);
      nock('https://api.github.com')
        .get('/teams/1337/members?per_page=100')
        .reply(200, manyTeamsResponsePage1, {
          link:
            '<https://api.github.com/teams/1337/members?page=2&per_page=100>; rel="next"',
        });
      nock('https://api.github.com')
        .get('/teams/1337/members?page=2&per_page=100')
        .reply(200, manyTeamsResponsePage2);
      const members = await github.getTeamMembers(1337);

      expect(members.length).toEqual(40);
    });
  });

  describe('getPullRequest', () => {
    it('fetches a pull request', async () => {
      expect.assertions(2);
      nock('https://api.github.com')
        .get('/repos/test_owner/test_repo/pulls/35')
        .reply(200, pullRequestResponse);
      const pr = await github.getPullRequest(35);

      // Author pulled from pull_request.35.json
      expect(pr.author).toEqual('ampprojectbot');
      expect(pr.number).toEqual(35);
    });
  });

  describe('getReviews', () => {
    it('fetches a list of reviews', async () => {
      expect.assertions(3);
      nock('https://api.github.com')
        .get('/repos/test_owner/test_repo/pulls/35/reviews?per_page=100')
        .reply(200, reviewsApprovedResponse);
      const [review] = await github.getReviews(35);

      expect(review.reviewer).toEqual('githubuser');
      expect(review.isApproved).toBe(true);
      expect(review.submittedAt).toEqual(new Date('2019-02-26T20:39:13Z'));
    });

    it('pages automatically', async () => {
      expect.assertions(1);
      nock('https://api.github.com')
        .get('/repos/test_owner/test_repo/pulls/23928/reviews?per_page=100')
        .reply(200, manyReviewsPage1Response, {
          link:
            '<https://api.github.com/repos/test_owner/test_repo/pulls/23928/reviews?page=2&per_page=100>; rel="next"',
        });
      nock('https://api.github.com')
        .get(
          '/repos/test_owner/test_repo/pulls/23928/reviews?page=2&per_page=100'
        )
        .reply(200, manyReviewsPage2Response);
      const reviews = await github.getReviews(23928);

      expect(reviews.length).toEqual(42);
    });

    it('returns approvals', async () => {
      expect.assertions(2);
      nock('https://api.github.com')
        .get('/repos/test_owner/test_repo/pulls/24686/reviews?per_page=100')
        .reply(200, commentReviewsResponse);
      const reviews = await github.getReviews(24686);
      const review = reviews[0];

      expect(review.reviewer).toEqual('rsimha');
      expect(review.isApproved).toBe(true);
    });

    it('returns post-review comments', async () => {
      expect.assertions(2);
      nock('https://api.github.com')
        .get('/repos/test_owner/test_repo/pulls/24686/reviews?per_page=100')
        .reply(200, commentReviewsResponse);
      const reviews = await github.getReviews(24686);
      const review = reviews[1];

      expect(review.reviewer).toEqual('rsimha');
      expect(review.isComment).toBe(true);
    });

    it('returns pre-review comments', async () => {
      expect.assertions(2);
      nock('https://api.github.com')
        .get('/repos/test_owner/test_repo/pulls/24686/reviews?per_page=100')
        .reply(200, commentReviewsResponse);
      const reviews = await github.getReviews(24686);
      const review = reviews[2];

      expect(review.reviewer).toEqual('fakename');
      expect(review.isComment).toBe(true);
    });

    it('returns rejections', async () => {
      expect.assertions(2);
      nock('https://api.github.com')
        .get('/repos/test_owner/test_repo/pulls/24686/reviews?per_page=100')
        .reply(200, commentReviewsResponse);
      const reviews = await github.getReviews(24686);
      const review = reviews[3];

      expect(review.reviewer).toEqual('fakename');
      expect(review.isRejected).toBe(true);
    });

    it('returns comment-only reviews', async () => {
      expect.assertions(2);
      nock('https://api.github.com')
        .get('/repos/test_owner/test_repo/pulls/24686/reviews?per_page=100')
        .reply(200, commentReviewsResponse);
      const reviews = await github.getReviews(24686);
      const review = reviews[4];

      expect(review.reviewer).toEqual('coder');
      expect(review.isComment).toBe(true);
    });

    it('ignores irrelevant review states', async () => {
      expect.assertions(1);
      nock('https://api.github.com')
        .get('/repos/test_owner/test_repo/pulls/24686/reviews?per_page=100')
        .reply(200, commentReviewsResponse);
      const reviews = await github.getReviews(24686);
      const review = reviews[5];

      expect(review).toBeUndefined();
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
      await github.createReviewRequests(24574, ['reviewer']);
    });

    it('skips the API call if no usernames are provided', async done => {
      // This will fail if it attempts to make an un-nocked network request.
      await github.createReviewRequests(24574, []);

      done();
    });
  });

  describe('getReviewRequests', () => {
    it('fetches a list of review requests', async () => {
      expect.assertions(1);
      nock('https://api.github.com')
        .get('/repos/test_owner/test_repo/pulls/24574/requested_reviewers')
        .reply(200, requestedReviewsResponse);
      const reviewers = await github.getReviewRequests(24574);

      expect(reviewers).toEqual(['scripter', 'someperson', 'birdperson']);
    });
  });

  describe('getBotComments', () => {
    it('fetches a list of comments by the bot user', async () => {
      expect.assertions(1);
      sandbox.stub(process, 'env').value({
        GITHUB_BOT_USERNAME: 'amp-owners-bot',
      });
      nock('https://api.github.com')
        .get('/repos/test_owner/test_repo/issues/24574/comments?per_page=100')
        .reply(200, issueCommentsResponse);
      const comments = await github.getBotComments(24574);

      expect(comments).toEqual([
        {
          id: 532484354,
          body: 'Test comment by ampprojectbot',
        },
      ]);
    });

    it('pages automatically', async () => {
      expect.assertions(1);
      sandbox.stub(process, 'env').value({
        GITHUB_BOT_USERNAME: 'amp-owners-bot',
      });
      nock('https://api.github.com')
        .get('/repos/test_owner/test_repo/issues/24574/comments?per_page=100')
        .reply(200, issueCommentsResponse, {
          link:
            '<https://api.github.com/repos/test_owner/test_repo/issues/24574/comments?page=2&per_page=100>; rel="next"',
        });
      nock('https://api.github.com')
        .get(
          '/repos/test_owner/test_repo/issues/24574/comments?page=2&per_page=100'
        )
        .reply(200, issueCommentsResponse);
      const comments = await github.getBotComments(24574);

      expect(comments.length).toBe(2);
    });
  });

  describe('createBotComment', () => {
    it('adds a comment to the pull request', async () => {
      expect.assertions(1);
      nock('https://api.github.com')
        .post('/repos/test_owner/test_repo/issues/24574/comments', body => {
          expect(body).toMatchObject({body: 'test comment'});
          return true;
        })
        .reply(200);
      await github.createBotComment(24574, 'test comment');
    });
  });

  describe('updateComment', () => {
    it('updates a PR comment', async () => {
      expect.assertions(1);
      nock('https://api.github.com')
        .patch('/repos/test_owner/test_repo/issues/comments/24574', body => {
          expect(body).toMatchObject({body: 'updated comment'});
          return true;
        })
        .reply(200);
      await github.updateComment(24574, 'updated comment');
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
      const contents = await github.getFileContents({
        filename: 'third_party/subscriptions-project/OWNERS',
        sha: 'eeae1593f4ecbae3f4453c9ceee2940a0e98ddca',
      });

      expect(contents).toEqual(
        '- otherperson\n- auser\n- otheruser\n- programmer\n- someperson\n'
      );
    });
  });

  describe('listFiles', () => {
    it('fetches the list of changed files', async () => {
      expect.assertions(2);
      nock('https://api.github.com')
        .get('/repos/test_owner/test_repo/pulls/35/files?per_page=100')
        .reply(200, listFilesResponsePage1);
      const files = await github.listFiles(35);

      expect(files.length).toBe(1);
      expect(files[0]).toEqual('dir2/dir1/dir1/file.txt');
    });

    it('pages automatically', async () => {
      expect.assertions(1);
      nock('https://api.github.com')
        .get('/repos/test_owner/test_repo/pulls/35/files?per_page=100')
        .reply(200, listFilesResponsePage1, {
          link:
            '<https://api.github.com/repos/test_owner/test_repo/pulls/35/files?per_page=100&page=2>; rel="next"',
        });
      nock('https://api.github.com')
        .get('/repos/test_owner/test_repo/pulls/35/files?per_page=100&page=2')
        .reply(200, listFilesResponsePage2);
      const files = await github.listFiles(35);

      expect(files.length).toBe(2);
    });
  });

  describe('searchCode', () => {
    it('fetches the list of matching files', async () => {
      expect.assertions(1);
      nock('https://api.github.com')
        .get(
          '/search/code?q=filename%3AREADME.md%20repo%3Atest_owner%2Ftest_repo&per_page=100'
        )
        .reply(200, searchReadmeResponse);
      const files = await github.searchFilename('README.md');
      expect(files.length).toEqual(23);
    });

    it('pages automatically', async () => {
      expect.assertions(1);
      nock('https://api.github.com')
        .get(
          '/search/code?q=filename%3AOWNERS%20repo%3Atest_owner%2Ftest_repo&per_page=100'
        )
        .reply(200, searchOwnersPage1Response, {
          link:
            '</search/code?q=filename%3AOWNERS%20repo%3Atest_owner%2Ftest_repo&page=2&per_page=100>; rel="next"',
        });
      nock('https://api.github.com')
        .get(
          '/search/code?q=filename%3AOWNERS%20repo%3Atest_owner%2Ftest_repo&page=2&per_page=100'
        )
        .reply(200, searchOwnersPage2Response);
      const files = await github.searchFilename('OWNERS');
      expect(files.length).toEqual(168);
    });

    it('only includes exact file matches', async () => {
      expect.assertions(3);
      nock('https://api.github.com')
        .get(
          '/search/code?q=filename%3Aexact-match%20repo%3Atest_owner%2Ftest_repo&per_page=100'
        )
        .reply(200, {
          total_count: 3,
          items: [
            {name: 'not-exact-match', path: 'foo/not-exact-match', sha: ''},
            {name: 'exact-match', path: 'foo/exact-match', sha: ''},
            {name: 'exact-match', path: 'exact-match', sha: ''},
          ],
        });
      const files = await github.searchFilename('exact-match');
      const filenames = files.map(({filename}) => filename);

      expect(filenames).not.toContainEqual('foo/not-exact-match');
      expect(filenames).toContainEqual('foo/exact-match');
      expect(filenames).toContainEqual('exact-match');
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
              text: 'Test text\n\nHELP TEXT',
            },
          });
          return true;
        })
        .reply(200);
      const checkRun = new CheckRun(
        CheckRunState.NEUTRAL,
        'Test summary',
        'Test text'
      );
      await github.createCheckRun('_test_hash_', checkRun);
    });
  });

  describe('getCheckRunIds', () => {
    it('fetches the first matching check-run from the list', async () => {
      expect.assertions(2);
      const sha = '9272f18514cbd3fa935b3ced62ae1c2bf6efa76d';
      nock('https://api.github.com')
        .get(`/repos/test_owner/test_repo/commits/${sha}/check-runs`)
        .reply(200, checkRunsListResponse);
      const checkRunIds = await github.getCheckRunIds(sha);

      // ID pulled from check-runs.get.35.multiple
      expect(checkRunIds['owners-check']).toEqual(53472315);
      expect(checkRunIds['another-check']).toEqual(53472313);
    });

    it('returns null if the list has no matching check-run', async () => {
      expect.assertions(1);
      nock('https://api.github.com')
        .get('/repos/test_owner/test_repo/commits/_missing_hash_/check-runs')
        .reply(200, checkRunsListResponse);
      const checkRunIds = await github.getCheckRunIds('_missing_hash_');

      expect(checkRunIds['owners-check']).toBeUndefined();
    });

    it('returns null if the list is empty', async () => {
      expect.assertions(1);
      nock('https://api.github.com')
        .get('/repos/test_owner/test_repo/commits/_test_hash_/check-runs')
        .reply(200, checkRunsEmptyResponse);
      const checkRunIds = await github.getCheckRunIds('_test_hash_');

      expect(checkRunIds['owners-check']).toBeUndefined();
    });

    it('returns null if there is an error querying GitHub', async () => {
      expect.assertions(1);
      nock('https://api.github.com')
        .get('/repos/test_owner/test_repo/commits/_test_hash_/check-runs')
        .replyWithError({
          message: 'Not found',
          code: 404,
        });
      const checkRunIds = await github.getCheckRunIds('_test_hash_');

      expect(checkRunIds['owners-check']).toBeUndefined();
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
              text: 'Test text\n\nHELP TEXT',
            },
          });
          return true;
        })
        .reply(200);
      const checkRun = new CheckRun(
        CheckRunState.NEUTRAL,
        'Test summary',
        'Test text'
      );
      await github.updateCheckRun(1337, checkRun);
    });
  });
});
