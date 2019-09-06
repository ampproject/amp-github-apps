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
const {GitHub, PullRequest} = require('../src/github');
const {LocalRepository} = require('../src/local_repo');
const {OwnersBot} = require('../src/owners_bot');
const {
  CheckRun,
  CheckRunConclusion,
  OwnersCheck,
} = require('../src/owners_check');

describe.only('owners bot', () => {
  let sandbox;
  const fakeGithub = new GitHub({}, 'ampproject', 'amphtml', console);
  const pr = new PullRequest(1337, 'author_user', 'test_sha');
  const localRepo = new LocalRepository('path/to/repo');
  const ownersBot = new OwnersBot(localRepo);

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    ownersBot.GITHUB_CHECKRUN_DELAY = 0;
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe('runOwnersCheck', () => {
    const checkRun = new CheckRun(
      CheckRunConclusion.SUCCESS,
      'Success!',
      'The owners check passed.'
    );
    let getCheckRunIdStub;

    beforeEach(() => {
      getCheckRunIdStub = sandbox.stub(GitHub.prototype, 'getCheckRunId');
      sandbox.stub(OwnersCheck.prototype, 'run').returns(checkRun);
      sandbox.stub(GitHub.prototype, 'updateCheckRun');
      sandbox.stub(GitHub.prototype, 'createCheckRun');
    });

    it('attempts to fetch the existing check-run ID', async () => {
      await ownersBot.runOwnersCheck(fakeGithub, pr);
      sandbox.assert.calledWith(fakeGithub.getCheckRunId, 'test_sha');
    });

    it('runs the owners check', async () => {
      await ownersBot.runOwnersCheck(fakeGithub, pr);
      sandbox.assert.calledOnce(OwnersCheck.prototype.run);
    });

    describe('when a check-run exists', () => {
      it('updates the existing check-run', async () => {
        getCheckRunIdStub.returns(42);
        await ownersBot.runOwnersCheck(fakeGithub, pr);

        sandbox.assert.calledWith(
          GitHub.prototype.updateCheckRun,
          42,
          checkRun
        );
      });
    });

    describe('when no check-run exists yet', () => {
      it('creates a new check-run', async () => {
        getCheckRunIdStub.returns(null);
        await ownersBot.runOwnersCheck(fakeGithub, pr);

        sandbox.assert.calledWith(
          GitHub.prototype.createCheckRun,
          'test_sha',
          checkRun
        );
      });
    });
  });

  describe('runOwnersCheckOnPrNumber', () => {
    beforeEach(() => {
      sandbox.stub(OwnersBot.prototype, 'runOwnersCheck');
      sandbox.stub(GitHub.prototype, 'getPullRequest').returns(pr);
    });

    it('fetches the PR from GitHub', async () => {
      await ownersBot.runOwnersCheckOnPrNumber(fakeGithub, 1337);
      sandbox.assert.calledWith(fakeGithub.getPullRequest, 1337);
    });

    it('runs the owners check on the retrieved PR', async () => {
      await ownersBot.runOwnersCheckOnPrNumber(fakeGithub, 1337);
      sandbox.assert.calledWith(ownersBot.runOwnersCheck, fakeGithub, pr);
    });
  });
});
