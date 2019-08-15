/**
 * Copyright 2019 Google Inc.
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

const {LocalRepository} = require('../src/local_repo');
const sinon = require('sinon');
const {OwnersParser, OwnersRule} = require('../src/owners');

describe('owners rules', () => {
  describe('depth', () => {
    it('should return 0 for files at the root', () => {
      const rule = new OwnersRule('OWNERS.yaml', []);
      expect(rule.depth).toEqual(0);
    });


    it('should return tree depth for files not at the root', () => {
      const ruleOne = new OwnersRule('src/OWNERS.yaml', []);
      const ruleTwo = new OwnersRule('foo/bar/OWNERS.yaml', []);
      const ruleFive = new OwnersRule('foo/bar/baz/biz/buzz/OWNERS.yaml', []);

      expect(ruleOne.depth).toEqual(1);
      expect(ruleTwo.depth).toEqual(2);
      expect(ruleFive.depth).toEqual(5);
    });
  });

  describe('matchesFile', () => {
    expect.extend({
      toMatchFile(receivedOwnersPath, filePath) {
        const rule = new OwnersRule(receivedOwnersPath, []);
        const matches = rule.matchesFile(filePath);
        const matchStr = this.isNot ? 'not match' : 'match'

        return {
          pass: matches,
          message: () => `Expected rules in '${receivedOwnersPath}' to ` +
              `${matchStr} file '${filePath}'.`,
        };
      }
    });

    it('matches a file in the same directory', () => {
      expect('OWNERS.yaml').toMatchFile('foo.txt');
    });

    it('matches a file in a child directory', () => {
      expect('OWNERS.yaml').toMatchFile('foo/bar.txt');
    });

    it('matches a file in an ancestor directory', () => {
      expect('OWNERS.yaml').toMatchFile('foo/bar/baz.txt');
    });

    it('does not match a file in a parent directory', () => {
      expect('src/OWNERS.yaml').not.toMatchFile('foo.txt');
    });

    it('does not match a file in a sibling directory', () => {
      expect('src/OWNERS.yaml').not.toMatchFile('test/foo.txt');
    });
  });
});

describe('owners parser', () => {
  const sandbox = sinon.createSandbox();
  let repo;
  let parser;

  beforeEach(() => {
    repo = new LocalRepository('path/to/repo');
    parser = new OwnersParser(repo);
  });

  afterEach(() => {sandbox.restore()});

  describe('parseOwnersFile', () => {
    it('reads the file from the local repository', () => {
      sandbox.stub(repo, 'readFile').returns('');
      parser.parseOwnersFile('foo/OWNERS.yaml');
      sandbox.assert.calledWith(repo.readFile, 'foo/OWNERS.yaml');
    });

    it('assigns the OWNERS directory path', async () => {
      sandbox.stub(repo, 'readFile').returns('');
      const rule = await parser.parseOwnersFile('foo/OWNERS.yaml');
      expect(rule.dirPath).toEqual('foo');
    });

    it('parses a YAML list', async () => {
      sandbox.stub(repo, 'readFile').returns('- user1\n- user2\n');
      const rule = await parser.parseOwnersFile('');
      expect(rule.owners).toEqual(['user1', 'user2']);
    });

    it('parses a YAML list with blank lines and comments', async () => {
      sandbox.stub(repo, 'readFile').returns('- user1\n# comment\n\n- user2\n');
      const rule = await parser.parseOwnersFile('');
      expect(rule.owners).toEqual(['user1', 'user2']);
    });
  });

  describe('parseAllOwnersRules', () => {
    it('reads all owners files in the repo', async () => {
      sandbox.stub(repo, 'findOwnersFiles').returns([
        'OWNERS.yaml', 'foo/OWNERS.yaml'
      ]);
      const readFileStub = sandbox.stub(repo, 'readFile')
      readFileStub.onCall(0).returns('- user1\n- user2\n');
      readFileStub.onCall(1).returns('- user3\n- user4\n');
      const rules = await parser.parseAllOwnersRules();

      expect(rules[0].dirPath).toEqual('.');
      expect(rules[1].dirPath).toEqual('foo');
      expect(rules[0].owners).toEqual(['user1', 'user2']);
      expect(rules[1].owners).toEqual(['user3', 'user4']);
    });
  });
});
