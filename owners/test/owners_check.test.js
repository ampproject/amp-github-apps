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

const {PullRequest, Review} = require('../src/github');
const {CheckRun, OwnersCheck} = require('../src/owners_check');

describe('check run', () => {
  describe('json', () => {
    it('produces a JSON object in the GitHub API format', () => {
      const checkRun = new CheckRun(true, 'Test text');
      const checkRunJson = checkRun.json;

      expect(checkRunJson.name).toEqual('ampproject/owners-check');
      expect(checkRunJson.status).toEqual('completed');
      expect(checkRunJson.conclusion).toEqual('neutral');
      expect(checkRunJson.output.title).toEqual('ampproject/owners-check');
      expect(checkRunJson.output.text).toEqual('Test text');
    });

    it('produces a the output summary based on the passing status', () => {
      const passingCheckRun = new CheckRun(true, '');
      const failingCheckRun = new CheckRun(false, '');

      expect(passingCheckRun.json.output.summary).toEqual(
        'The check was a success!'
      );
      expect(failingCheckRun.json.output.summary).toEqual(
        'The check was a failure!'
      );
    });
  });
});

describe('owners check', () => {
  describe('getApprovers', () => {
    /* eslint-disable-next-line require-jsdoc */
    class FakeGithub {
      /* eslint-disable-next-line require-jsdoc */
      constructor(reviews) {
        this.getReviews = () => reviews;
      }
    }
    const pr = new PullRequest(35, 'the_author', '_test_hash_');

    const timestamp = '2019-01-01T00:00:00Z';
    const approval = new Review('approver', 'approved', timestamp);
    const authorApproval = new Review('the_author', 'approved', timestamp);
    const otherApproval = new Review('other_approver', 'approved', timestamp);
    const rejection = new Review('rejector', 'changes_requested', timestamp);

    it("returns the reviewers' usernames", async () => {
      const ownersCheck = new OwnersCheck(
        new FakeGithub([approval, otherApproval]),
        pr
      );
      const approvers = await ownersCheck.getApprovers();

      expect(approvers).toContain('approver', 'other_approver');
    });

    it('includes the author', async () => {
      const ownersCheck = new OwnersCheck(new FakeGithub([]), pr);
      const approvers = await ownersCheck.getApprovers();

      expect(approvers).toContain('the_author');
    });

    it('produces unique usernames', async () => {
      const ownersCheck = new OwnersCheck(
        new FakeGithub([approval, approval, authorApproval]),
        pr
      );
      const approvers = await ownersCheck.getApprovers();

      expect(approvers).toEqual(['approver', 'the_author']);
    });

    it('includes only reviewers who approved the review', async () => {
      const ownersCheck = new OwnersCheck(
        new FakeGithub([approval, rejection]),
        pr
      );
      const approvers = await ownersCheck.getApprovers();

      expect(approvers).not.toContain('rejector');
    });
  });
});
