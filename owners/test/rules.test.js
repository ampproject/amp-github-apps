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

const {OwnersRule, PatternOwnersRule} = require('../src/rules');

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

    describe('toString', () => {
      it('lists all owners', () => {
        const rule = new OwnersRule('OWNERS.yaml', ['rcebulko', 'erwinmombay']);

        expect(rule.toString()).toEqual('All: rcebulko, erwinmombay');
      });
    });
  });

  describe('with glob patterns', () => {
    describe('constructor', () => {
      it.each([
        ['file.txt', /file\.txt/],
        ['package*.json', /package.*?\.json/],
      ])('converts the pattern %p into regex %p', (pattern, expectedRegex) => {
        const rule = new PatternOwnersRule('OWNERS.yaml', [], pattern);
        expect(rule.regex).toEqual(expectedRegex);
      });
    });

    describe('regexEscape', () => {
      it.each([])('escapes %p as %p', (text, expected) => {
        expect(PatternOwnersRule.escapeRegexChars(text)).toEqual(expected);
      });
    });

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

      it.each([
        ['package.json', 'foo/package.json'],
        ['*.js', 'bar/main.js'],
        ['*.css', 'foo/bar/baz/style.css'],
      ])('pattern %p matches nested file %p', (pattern, filePath) => {
        expect(new PatternOwnersRule('OWNERS.yaml', [], pattern)).toMatchFile(
          filePath
        );
      });
    });

    describe('toString', () => {
      it('lists all owners for the pattern', () => {
        const rule = new PatternOwnersRule(
          'OWNERS.yaml',
          ['rcebulko', 'erwinmombay'],
          '*.css'
        );

        expect(rule.toString()).toEqual('*.css: rcebulko, erwinmombay');
      });
    });
  });
});
