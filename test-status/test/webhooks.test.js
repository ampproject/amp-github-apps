/**
 * Copyright 2019, the AMP HTML authors
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

const deepcopy = require('deepcopy');
const nock = require('nock');
const {dbConnect} = require('../db-connect');
const {installGitHubWebhooks} = require('../webhooks');
const {Probot} = require('probot');
const {setupDb} = require('../setup-db');

jest.mock('../db-connect');
jest.setTimeout(5000);
nock.disableNetConnect();

/**
 * Get a JSON test fixture object.
 *
 * Returns a copy of the object, since modifying the object that gets returned
 * via `require` directly will cause all future calls to `require(sameFile)` to
 * return the previously modified object.
 *
 * @param {!string} name name of the JSON fixture file (without .json).
 * @return {!object} the named JSON test fixture file.
 */
function getFixture(name) {
  return deepcopy(require(`./fixtures/${name}`));
}

describe('test-status/webhooks', () => {
  let probot;
  let app;
  const db = dbConnect();

  beforeAll(async () => {
    await setupDb(db);

    probot = new Probot({});
    app = probot.load(app => {
      installGitHubWebhooks(app, db);
    });

    // Return a test token.
    app.app = {
      getInstallationAccessToken: () => Promise.resolve('test'),
    };
  });

  beforeEach(async () => {
    nock('https://api.github.com')
      .post('/app/installations/123456/access_tokens')
      .reply(200, {token: 'test'});
  });

  afterEach(async () => {
    await db('pullRequestSnapshots').truncate();
    await db('checks').truncate();
  });

  afterAll(async () => {
    await db.destroy();
  });

  test('store a snapshot when a pull request is opened', async () => {
    await probot.receive({
      name: 'pull_request',
      payload: getFixture('pull_request.opened'),
    });

    expect(await db('pullRequestSnapshots').select('*')).toMatchObject([
      {
        headSha: '39f787c8132f9ccc956ed465c0af8bc33f641404',
        owner: 'ampproject',
        repo: 'amphtml',
        pullRequestId: 19621,
        installationId: 123456,
      },
    ]);
    expect(await db('checks').select('*')).toHaveLength(0);
  });
});
