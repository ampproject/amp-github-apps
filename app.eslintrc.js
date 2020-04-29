/**
 * Copyright 2020 The AMP HTML Authors. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the 'License');
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an 'AS-IS' BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

const merge = require('deepmerge')
const path = require('path');

// Let child configs overwrite arrays.
const arrayMerge = (destArr, sourceArr, opts) => sourceArr;

const jsConfig = (...childConfigs) => merge.all([
  {
    'root': true,
    'plugins': [
      'notice',
      'prettier',
      'sort-requires',
    ],
    'env': {
      'es6': true,
      'jest': true,
      'node': true,
    },
    'extends': [
      'prettier',
    ],
    'parserOptions': {
      'ecmaVersion': 2018,
    },
    'rules': {
      'camelcase': 'error',
      'curly': 'error',
      'no-alert': 'error',
      'no-debugger': 'error',
      'no-div-regex': 'error',
      'no-dupe-keys': 'error',
      'no-eval': 'error',
      'no-extend-native': 'error',
      'no-extra-bind': 'error',
      'no-global-assign': 'error',
      'no-implicit-coercion': ['error', { 'boolean': false }],
      'no-implied-eval': 'error',
      'no-iterator': 'error',
      'no-lone-blocks': 'error',
      'no-native-reassign': 'error',
      'no-redeclare': 'error',
      'no-script-url': 'error',
      'no-self-compare': 'error',
      'no-sequences': 'error',
      'no-throw-literal': 'error',
      'no-undef': 'error',
      'no-unused-expressions': 'error',
      'no-unused-vars': ['error', { 'argsIgnorePattern': "^(_$|unused)"}],
      'no-useless-call': 'error',
      'no-useless-concat': 'error',
      'no-var': 'error',
      'no-warning-comments': ['error', { 'terms': ['do not submit'], 'location': 'anywhere' }],
      'notice/notice': [
        'error',
        {
          'mustMatch': 'Copyright 20\\d{2} The AMP HTML Authors\\.',
          'templateFile': path.resolve(__dirname, 'build-system/LICENSE-TEMPLATE.txt'),
          'messages': {
            'whenFailedToMatch': 'Missing or incorrect license header'
          }
        }
      ],
      'object-shorthand': ['error', 'properties', { 'avoidQuotes': true }],
      'prefer-const': 'error',
      'prettier/prettier': 'error',
      'prefer-const': 'error',
      'radix': 'error',
      'sort-requires/sort-requires': 'error'
    },
  },
  ...childConfigs
], { arrayMerge });

const tsConfig = (appDir, ...childConfigs) => jsConfig({
  'plugins': [
    '@typescript-eslint',
    'notice',
    'prettier',
    'sort-imports-es6-autofix',
  ],
  'parser': '@typescript-eslint/parser',
  'extends': [
    'plugin:@typescript-eslint/recommended',
    'prettier',
    'prettier/@typescript-eslint',
  ],
  'parserOptions': {
    'ecmaVersion': 6,
    'sourceType': 'module',
    'project': path.resolve(__dirname, appDir, './tsconfig.json')
  },
  'rules': {
    '@typescript-eslint/await-thenable': 'error',
    '@typescript-eslint/camelcase': ['error', { 'properties': 'always' }],
    '@typescript-eslint/promise-function-async': 'error',
    '@typescript-eslint/type-annotation-spacing': 'error',
    '@typescript-eslint/no-unused-vars': 'error',
    '@typescript-eslint/semi': 'error',

    // Off for @typescript-eslint rule
    'camelcase': 'off',
    'indent': 'off',
    'no-unused-vars': 'off',
    'semi': 'off',

    'sort-requires/sort-requires': 'off',
    'sort-imports-es6-autofix/sort-imports-es6': [
      'error',
      {
        'ignoreCase': false,
        'ignoreMemberSort': false,
        'memberSyntaxSortOrder': ['none', 'all', 'multiple', 'single']
      }
    ],
  },
}, ...childConfigs);

module.exports = { jsConfig, tsConfig };
