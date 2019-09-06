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

      it('shows when there are no owners', () => {
        const rule = new OwnersRule('OWNERS.yaml', []);

        expect(rule.toString()).toEqual('All: -');
      });
    });
  });

  describe('with glob patterns', () => {
    describe('constructor', () => {
      it.each([
        ['file.txt', /file\.txt/],
        ['package*.json', /package.*?\.json/],
        ['*.css, *.js', /.*?\.css|.*?\.js/],
      ])(
        'converts the pattern "%p" into regex "%p"',
        (pattern, expectedRegex) => {
          const rule = new PatternOwnersRule('OWNERS.yaml', [], pattern);
          expect(rule.regex).toEqual(expectedRegex);
        }
      );
    });

    describe('regexEscape', () => {
      it.each([
        ['file.txt', 'file\\.txt'],
        ['this+that.txt', 'this\\+that\\.txt'],
        ['*.css, *.js', '\\*\\.css, \\*\\.js'],
        ['with space.txt', 'with space\\.txt'],
        ['with-hyphen.txt', 'with-hyphen\\.txt'],
      ])('escapes "%p" as "%p"', (text, expected) => {
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

      it('matches comma-separated patterns', () => {
        const rule = new PatternOwnersRule('OWNERS.yaml', [], '*.js, *.css');

        expect(rule).toMatchFile('main.js');
        expect(rule).toMatchFile('style.css');
      });

      it('matches files in subdirectories', () => {
        expect(
          new PatternOwnersRule('OWNERS.yaml', [], 'package.json')
        ).toMatchFile('foo/package.json');

        expect(new PatternOwnersRule('OWNERS.yaml', [], '*.js')).toMatchFile(
          'bar/main.js'
        );

        expect(
          new PatternOwnersRule('OWNERS.yaml', [], '*.js, *.css')
        ).toMatchFile('foo/baz/main.js');
        expect(
          new PatternOwnersRule('OWNERS.yaml', [], '*.js, *.css')
        ).toMatchFile('foo/bar/baz/style.css');
      });
    });

    describe('toString', () => {
      it('lists all owners for the pattern', () => {
        const rule = new PatternOwnersRule(
          'OWNERS.yaml',
          ['rcebulko', 'erwinmombay'],
          '*.js, *.css'
        );

        expect(rule.toString()).toEqual('*.js, *.css: rcebulko, erwinmombay');
      });
    });
  });
});
