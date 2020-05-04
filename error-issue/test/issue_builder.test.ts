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

import {BlameRange, ErrorReport} from 'error-issue-bot';
import {IssueBuilder} from '../src/issue_builder';
import {getFixtureFile} from './fixtures';

describe('IssueBuilder', () => {
  let builder: IssueBuilder;
  const now = new Date('Mar 1, 2020');
  const report: ErrorReport = {
    errorId: 'CL6chqbN2-bzBA',
    firstSeen: new Date('Feb 25, 2020'),
    dailyOccurrences: 54647,
    stacktrace: `Error: null is not an object (evaluating 'b.acceleration.x')
        at x (https://raw.githubusercontent.com/ampproject/amphtml/2004030010070/extensions/amp-delight-player/0.1/amp-delight-player.js:421:13)
        at event (https://raw.githubusercontent.com/ampproject/amphtml/2004030010070/src/event-helper-listen.js:58:27)`,
  };
  const oldReport = Object.assign({}, report, {
    firstSeen: new Date('Oct 1, 2017'),
  });
  const blames = [
    {
      path: 'extensions/amp-delight-player/0.1/amp-delight-player.js',
      startingLine: 396,
      endingLine: 439,
      author: '@xymw',
      committedDate: new Date('2018-11-12T21:22:43.000Z'),
      changedFiles: 15,
      prNumber: 17939,
    },
    {
      path: 'src/event-helper-listen.js',
      startingLine: 57,
      endingLine: 59,
      author: '@rsimha',
      committedDate: new Date('2017-12-13T23:56:40.000Z'),
      changedFiles: 340,
      prNumber: 12450,
    },
  ];

  beforeEach(() => {
    jest.spyOn(Date, 'now').mockReturnValue(now.valueOf());
    builder = new IssueBuilder(report, blames, 'test_org/onduty-team');
  });

  describe('title', () => {
    it('contains the error message', () => {
      expect(builder.title).toEqual(
        "🚨 Error: null is not an object (evaluating 'b.acceleration.x')"
      );
    });
  });

  describe('labels', () => {
    it('contains the error report label', () => {
      expect(builder.labels).toContain('Type: Error Report');
    });
  });

  describe('bodyDetails', () => {
    it('links to the error', () => {
      expect(builder.bodyDetails).toContain(
        '**Error report:** [link](http://go/ampe/CL6chqbN2-bzBA'
      );
    });

    it('records the date first seen', () => {
      expect(builder.bodyDetails).toContain('**First seen:** Feb 25, 2020');
    });

    it('records the daily frequency', () => {
      expect(builder.bodyDetails).toContain('**Frequency:** ~ 54,647/day');
    });
  });

  describe('possibleAssignees', () => {
    const fakeBlame = (
      path: string,
      author: string,
      dateStr: string,
      changedFiles: number
    ): BlameRange => ({
      path,
      startingLine: 1,
      endingLine: 10,
      author,
      committedDate: new Date(dateStr),
      changedFiles,
      prNumber: 1337,
    });
    const blames = [
      fakeBlame('src/error.js', '@log_author', 'Jan 1, 2020', 15),
      fakeBlame('src/log.js', '@log_author', 'Jan 1, 2020', 15),
      fakeBlame('dom.js', 're@cent_author', 'Apr 1, 2020', 4),
      fakeBlame('src/chunk.js', '@older_author', 'Nov 1, 2019', 2),
      fakeBlame('src/chunk.js', '@relevant_author', 'Dec 1, 2019', 2),
      fakeBlame('src/chunk.js', '@first_author', 'Oct 1, 2019', 2),
      fakeBlame('src/chunk.js', '@refactor_author', 'Dec 1, 2019', 340),
    ];

    it('returns authors of most recent relevant PRs sorted by recency', () => {
      builder = new IssueBuilder(report, blames);
      expect(builder.possibleAssignees(3)).toEqual([
        '@relevant_author',
        '@older_author',
        '@first_author',
      ]);
    });

    it('limits the number of suggestions', () => {
      builder = new IssueBuilder(report, blames);
      expect(builder.possibleAssignees()).toEqual([
        '@relevant_author',
        '@older_author',
      ]);
    });

    it('does not try to assign very old errors', () => {
      builder = new IssueBuilder(oldReport, blames);
      expect(builder.possibleAssignees()).toEqual([]);
    });
  });

  describe('bodyStacktrace', () => {
    it('renders the indented stacktrace in markdown', () => {
      expect(builder.bodyStacktrace).toContain(
        '```\n' +
          "Error: null is not an object (evaluating 'b.acceleration.x')\n" +
          '    at x (https://raw.githubusercontent.com/ampproject/amphtml/2004030010070/extensions/amp-delight-player/0.1/amp-delight-player.js:421:13)\n' +
          '    at event (https://raw.githubusercontent.com/ampproject/amphtml/2004030010070/src/event-helper-listen.js:58:27)\n' +
          '```'
      );
    });
  });

  describe('bodyNotes', () => {
    it('includes blame info for each line of the stacktrace', () => {
      const notes = builder.bodyNotes;
      expect(notes).toContain(
        '`@xymw` modified ' +
          '`extensions/amp-delight-player/0.1/amp-delight-player.js:396-439` ' +
          'in #17939 (Nov 12, 2018)'
      );
      expect(notes).toContain(
        '`@rsimha` modified `src/event-helper-listen.js:57-59` in #12450 ' +
          '(Dec 13, 2017)'
      );
    });

    it('suggests possible assignees, if known', () => {
      expect(builder.bodyNotes).toContain('**Possible assignees:** `@xymw`');

      builder = new IssueBuilder(oldReport, blames);
      expect(builder.bodyNotes).not.toContain('Possible assignees:');
    });

    it('returns empty string when there is no blame info', () => {
      builder = new IssueBuilder(report, []);
      expect(builder.bodyNotes).toEqual('');
    });
  });

  describe('bodyTag', () => {
    it('CCs the release on-duty', () => {
      expect(builder.bodyTag).toEqual('/cc @test_org/onduty-team');
    });

    it('is undefined when no onduty team is provided', () => {
      builder = new IssueBuilder(report, blames);
      expect(builder.bodyTag).toBeUndefined();
    });
  });

  describe('body', () => {
    it('generates the full issue body markdown', () => {
      expect(builder.body).toEqual(getFixtureFile('created-issue.md').trim());
    });
  });
});
