/**
 * Copyright 2020 The AMP HTML Authors. All Rights Reserved.
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

import nock from 'nock';

import {BlameFinder} from '../src/blame_finder';
import {ErrorIssueBot} from '../src/bot';
import {IssueBuilder} from '../src/issue_builder';

describe('ErrorIssueBot', () => {
  let bot: ErrorIssueBot;

  const errorId = 'CL6chqbN2-bzBA';
  const firstSeen = new Date('Feb 25, 2020');
  const dailyOccurrences = 54647;
  const stacktrace = `Error: null is not an object (evaluating 'b.acceleration.x')
        at x (https://raw.githubusercontent.com/ampproject/amphtml/2004030010070/extensions/amp-delight-player/0.1/amp-delight-player.js:421:13)
        at event (https://raw.githubusercontent.com/ampproject/amphtml/2004030010070/src/event-helper-listen.js:58:27)`;
  const seenInVersions = [
    '04-24 Beta (1234)',
    '04-24 Experimental (1234)',
    '04-24 Stable (1234)',
    '+2 more',
  ];
  const errorReport = {
    errorId,
    firstSeen,
    dailyOccurrences,
    stacktrace,
    seenInVersions,
  };

  beforeAll(() => {
    nock.disableNetConnect();
  });

  afterAll(() => {
    nock.enableNetConnect();
  });

  beforeEach(() => {
    bot = new ErrorIssueBot('__TOKEN__', 'test_org', 'test_repo', 'issue_repo');
    nock.cleanAll();

    jest.spyOn(BlameFinder.prototype, 'blameForStacktrace').mockResolvedValue([
      {
        path: 'extensions/amp-delight-player/0.1/amp-delight-player.js',
        startingLine: 396,
        endingLine: 439,
        author: 'xymw',
        committedDate: new Date('2018-11-12T21:22:43.000Z'),
        prNumber: 17939,
        changedFiles: 15,
      },
      {
        path: 'src/event-helper-listen.js',
        startingLine: 57,
        endingLine: 59,
        author: 'rsimha',
        committedDate: new Date('2017-12-13T23:56:40.000Z'),
        prNumber: 12450,
        changedFiles: 340,
      },
    ]);

    afterEach(() => {
      // Fail the test if there were unused nocks.
      if (!nock.isDone()) {
        throw new Error('Not all nock interceptors were used!');
      }
      nock.cleanAll();
    });

    jest
      .spyOn(IssueBuilder.prototype, 'title', 'get')
      .mockReturnValue('issue title');
    jest
      .spyOn(IssueBuilder.prototype, 'labels', 'get')
      .mockReturnValue(['label']);
    jest
      .spyOn(IssueBuilder.prototype, 'body', 'get')
      .mockReturnValue('issue body');
  });

  describe('buildErrorIssue', () => {
    it('determines blame for the stacktrace', async () => {
      await bot.buildErrorIssue(errorReport);
      expect(BlameFinder.prototype.blameForStacktrace).toHaveBeenCalledWith(
        stacktrace
      );
    });

    it('builds the issue to be created', async () => {
      await expect(bot.buildErrorIssue(errorReport)).resolves.toEqual({
        owner: 'test_org',
        repo: 'issue_repo',
        title: 'issue title',
        labels: ['label'],
        body: 'issue body',
      });
    });
  });

  describe('commentWithDupe', () => {
    it('creates a comment linking to the duplicate error report', async () => {
      nock('https://api.github.com')
        .post('/repos/test_org/issue_repo/issues/1337/comments', body => {
          expect(body.body).toContain('([link](http://go/ampe/a1b2c3d4e5))');
          return true;
        })
        .reply(201);

      await bot.commentWithDupe('a1b2c3d4e5', 'issue_repo', 1337);
    });
  });

  describe('report', () => {
    const issueUrl = 'https://github.com/ampproject/amphtml/issues/1337';

    it('creates an error issue', async () => {
      nock('https://api.github.com')
        .post('/repos/test_org/issue_repo/issues', body => {
          expect(body).toEqual({
            title: 'issue title',
            labels: ['label'],
            body: 'issue body',
          });
          return true;
        })
        .reply(201, {'html_url': issueUrl});

      await expect(bot.report(errorReport)).resolves.toEqual(issueUrl);
    });

    it('propagates the error when the API call fails', async () => {
      nock('https://api.github.com')
        .post('/repos/test_org/issue_repo/issues')
        .reply(401, {name: 'HttpError', status: 401});

      await expect(bot.report(errorReport)).rejects.toMatchObject({
        status: 401,
      });
    });
  });
});
