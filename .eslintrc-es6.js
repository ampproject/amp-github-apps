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

const path = require('path');

module.exports = {
  'root': true,
  'plugins': [
      '@typescript-eslint',
      'notice',
      'prettier',
      'sort-imports-es6-autofix',
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
    'radix': 'error',
    'sort-requires/sort-requires': 'error'
  },
};
