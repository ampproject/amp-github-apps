/**
 * Copyright 2021 The AMP HTML Authors. All Rights Reserved.
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

const mockOctokit = {
  issues: {
    createComment: jest.fn(),
  },
  pulls: {
    get: jest.fn(),
  },
  repos: {
    listCommitStatusesForRef: jest.fn(),
  },
};
jest.doMock('@octokit/rest', () => ({
  Octokit: jest.fn().mockImplementation(() => mockOctokit),
}));

import {RestEndpointMethodTypes} from '@octokit/rest';

import {getPercyBuildId, postErrorComment} from '../src/github';

type OctokitPullsGetResponse =
  RestEndpointMethodTypes['pulls']['get']['response'];

describe('github', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  describe('getPercyBuildId', () => {
    it('gets Percy build id', async () => {
      mockOctokit.pulls.get.mockResolvedValue({
        data: {head: {sha: '6f91e57c4ec735bda983f253304b46058518f62a'}},
      } as OctokitPullsGetResponse);
      mockOctokit.repos.listCommitStatusesForRef.mockResolvedValue({
        data: [
          {context: 'github_actions'},
          {
            context: 'percy/amphtml',
            'target_url': 'https://percy.io/ampproject/amphtml/builds/5678',
          },
        ],
      });

      const percyBuildId = await getPercyBuildId(1234);

      expect(percyBuildId).toEqual(5678);
    });

    it('rejects when not Percy status', async () => {
      mockOctokit.pulls.get.mockResolvedValue({
        data: {head: {sha: '6f91e57c4ec735bda983f253304b46058518f62a'}},
      } as OctokitPullsGetResponse);
      mockOctokit.repos.listCommitStatusesForRef.mockResolvedValue({
        data: [{context: 'github_actions'}],
      });

      await expect(getPercyBuildId(1234)).rejects.toThrow(
        "Cannot read properties of undefined (reading 'target_url')"
      );
    });

    it('rejects when Percy status is malformed', async () => {
      mockOctokit.pulls.get.mockResolvedValue({
        data: {head: {sha: '6f91e57c4ec735bda983f253304b46058518f62a'}},
      } as OctokitPullsGetResponse);
      mockOctokit.repos.listCommitStatusesForRef.mockResolvedValue({
        data: [{context: 'percy/amphtml', 'target_url': 'https://not.percy/'}],
      });

      await expect(getPercyBuildId(1234)).rejects.toThrow(
        'object null is not iterable (cannot read property Symbol(Symbol.iterator))'
      );
    });
  });

  describe('postErrorComment', () => {
    it('posts a comment', async () => {
      await postErrorComment(1234, 5678901, 2345678);

      expect(mockOctokit.issues.createComment).toHaveBeenCalledWith(
        expect.objectContaining({
          owner: 'ampproject',
          repo: 'amphtml',
          'issue_number': 1234,
          body: expect.stringContaining(
            'disparity between this PR Percy build and its `main` build'
          ),
        })
      );
    });
  });
});
