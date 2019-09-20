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

const {
  OwnersRule,
  PatternOwnersRule,
  SameDirPatternOwnersRule,
  RULE_PRIORITY,
} = require('../src/rules');

describe('owners rules', () => {
  expect.extend({
    toMatchFile(rule, filePath) {
      const matches = rule.matchesFile(filePath);
      const matchStr = this.isNot ? 'not match' : 'match';

      return {
        pass: matches,
        message: () =>
          `Expected rules in '${rule.filePath}' to ` +
          `${matchStr} file '${filePath}'.`,
      };
    },
  });

  describe('basic directory ownership', () => {
    describe('matchesFile', () => {
      it('matches all files', () => {
        const rule = new OwnersRule('src/OWNERS.yaml', []);

        expect(rule).toMatchFile('src/foo.txt');
        expect(rule).toMatchFile('src/foo/bar.txt');
        expect(rule).toMatchFile('src/foo/bar/baz.txt');
      });
    });

    describe('label', () => {
      it('is "**/*"', () => {
        const rule = new OwnersRule('OWNERS.yaml', []);

        expect(rule.label).toEqual('**/*');
      });
    });

    describe('priority', () => {
      it('is DIRECTORY', () => {
        const rule = new OwnersRule('OWNERS.yaml', []);

        expect(rule.priority).toBe(RULE_PRIORITY.DIRECTORY);
      });
    });

    describe('toString', () => {
      it('lists all owners', () => {
        const rule = new OwnersRule('OWNERS.yaml', ['rcebulko', 'erwinmombay']);

        expect(rule.toString()).toEqual('**/*: rcebulko, erwinmombay');
      });
    });
  });

  describe('with glob patterns', () => {
    describe('matchesFile', () => {
      it('matches literal filenames', () => {
        const rule = new PatternOwnersRule('OWNERS.yaml', [], 'package.json');

        expect(rule).toMatchFile('package.json');
      });

      it('matches glob patterns', () => {
        const rule = new PatternOwnersRule('OWNERS.yaml', [], '*.js');

        expect(rule).toMatchFile('main.js');
      });

      it.each([
        ['file.txt', 'file.txt'],
        ['this+that.txt', 'this+that.txt'],
        ['with space.txt', 'with space.txt'],
        ['with-hyphen.txt', 'with-hyphen.txt'],
      ])('simple file name %p matches file %p', (pattern, filePath) => {
        expect(new PatternOwnersRule('OWNERS.yaml', [], pattern)).toMatchFile(
          filePath
        );
      });

      it.each([
        ['*.txt', 'file.txt'],
        ['*.test.txt', 'file.test.txt'],
        ['package*.json', 'package.lock.json'],
      ])('pattern %p matches file %p', (pattern, filePath) => {
        expect(new PatternOwnersRule('OWNERS.yaml', [], pattern)).toMatchFile(
          filePath
        );
      });

      it('fails for non-matching patterns', () => {
        const rule = new PatternOwnersRule('OWNERS.yaml', [], '*.js');

        expect(rule).not.toMatchFile('style.css');
      });

      it.each([
        ['*.{js,css}', 'file.js'],
        ['*.{js,css}', 'style.css'],
        ['package{,-lock}.json', 'package.json'],
        ['package{,.lock}.json', 'package.lock.json'],
      ])('brace-set pattern %p matches file %p', (pattern, filePath) => {
        expect(new PatternOwnersRule('OWNERS.yaml', [], pattern)).toMatchFile(
          filePath
        );
      });
    });

    describe('label', () => {
      it('is the pattern', () => {
        const rule = new PatternOwnersRule('OWNERS.yaml', [], '*.css');

        expect(rule.label).toEqual('**/*.css');
      });
    });

    describe('priority', () => {
      it('is RECURSIVE_PATTERN', () => {
        const rule = new PatternOwnersRule('OWNERS.yaml', [], '*.css');

        expect(rule.priority).toBe(RULE_PRIORITY.RECURSIVE_PATTERN);
      });
    });

    describe('toString', () => {
      it('lists all owners for the pattern', () => {
        const rule = new PatternOwnersRule(
          'OWNERS.yaml',
          ['rcebulko', 'erwinmombay'],
          '*.css'
        );

        expect(rule.toString()).toEqual('**/*.css: rcebulko, erwinmombay');
      });
    });

    describe('in the same directory', () => {
      const rule = new SameDirPatternOwnersRule('foo/OWNERS.yaml', [], '*.js');

      describe('label', () => {
        it('is the pattern in the "./" directory', () => {
          expect(rule.label).toEqual('./*.js');
        });
      });

      describe('priority', () => {
        it('is SAME_DIRECTORY_PATTERN', () => {
          expect(rule.priority).toBe(RULE_PRIORITY.SAME_DIRECTORY_PATTERN);
        });
      });

      describe('matchesFile', () => {
        it('fails if there is no pattern match', () => {
          expect(rule).not.toMatchFile('style.css');
        });

        it('fails for files in subdirectories', () => {
          expect(rule).not.toMatchFile('foo/bar/code.js');
        });

        it('passes for matching files in the same directory', () => {
          expect(rule).toMatchFile('foo/main.js');
        });

        it('works for files and rules in the root directory', () => {
          expect(
            new SameDirPatternOwnersRule('OWNERS.yaml', [], '*.js')
          ).toMatchFile('main.js');
        });
      });
    });
  });
});
