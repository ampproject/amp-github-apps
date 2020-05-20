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

const request = require('supertest');
const sinon = require('sinon');

const InfoServer = require('../info_server');
const Repository = require('../src/repo/repo');
const {GitHub, Team} = require('../src/api/github');
const {OwnersBot} = require('../src/owners_bot');

/* eslint-disable require-jsdoc */
class FakeRepository extends Repository {
  readFile(unusedRelativePath) {
    return '';
  }

  findOwnersFiles() {
    return [];
  }
}
/* eslint-enable require-jsdoc */

describe('server', () => {
  const repo = new FakeRepository();
  const myTeam = new Team('test_owner', 'my-team');
  const github = new GitHub({}, 'test_owner', 'test_repo');
  const ownersBot = new OwnersBot(repo);
  ownersBot.teams[myTeam.toString()] = myTeam;
  const server = new InfoServer(ownersBot, github);
  const app = server.app;

  let sandbox;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    // sandbox.stub(console);
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe('/v0/syntax', () => {
    const checkSyntax = async data =>
      request(app)
        .post('/v0/syntax')
        .send(data)
        .then(({body}) => body);

    const checkFile = async ownersFileDef =>
      checkSyntax({
        path: 'OWNERS',
        contents: JSON.stringify(ownersFileDef),
      });

    it('fails if "path" is missing', async () => {
      expect.assertions(1);
      const response = await checkSyntax({contents: ''});
      expect(response.requestErrors[0]).toContain('Missing key "path"');
    });

    it('fails if "contents" is missing', async () => {
      expect.assertions(1);
      const response = await checkSyntax({path: 'OWNERS'});
      expect(response.requestErrors[0]).toContain('Missing key "contents"');
    });

    it('fails if "contents" >5000 bytes', async () => {
      expect.assertions(1);
      const response = await checkSyntax({
        path: 'OWNERS',
        contents: 'x'.repeat(5001),
      });
      expect(response.requestErrors[0]).toContain('Owners file too large');
    });

    it('reports parsing errors', async () => {
      expect.assertions(1);
      const response = await checkFile({});
      expect(response.fileErrors[0]).toContain(
        'top-level "rules" key must contain a list'
      );
    });

    it('reports parsed rules', async () => {
      expect.assertions(3);
      const response = await checkFile({
        rules: [
          {
            owners: [{name: 'importante'}],
          },
          {
            pattern: '*.js',
            owners: [{name: 'somebody'}],
          },
          {
            pattern: '**/*.css',
            owners: [{name: 'styleperson'}],
          },
        ],
      });

      expect(response.rules).toContain('**/*: importante');
      expect(response.rules).toContain('./*.js: somebody');
      expect(response.rules).toContain('**/*.css: styleperson');
    });

    it('uses the known team mapping', async () => {
      expect.assertions(2);
      const response = await checkFile({
        rules: [
          {
            owners: [
              {name: 'test_owner/my-team'},
              {name: 'test_owner/other-team'},
            ],
          },
        ],
      });

      expect(response.rules).toContain('**/*: test_owner/my-team []');
      expect(response.fileErrors[0]).toContain(
        "Unrecognized team: 'test_owner/other-team'"
      );
    });
  });
});
