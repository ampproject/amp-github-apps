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
    'react',
    'sort-imports-es6-autofix',
  ],
  'env': {
    'es6': true,
    'jest': true,
    'node': true,
    'browser': true,
  },
  'parser': '@typescript-eslint/parser',
  'extends': [
    'plugin:react/recommended',
    'plugin:@typescript-eslint/recommended',
    'prettier',
    'prettier/@typescript-eslint',
  ],
  'parserOptions': {
    'ecmaVersion': 6,
    'sourceType': 'module',
    'ecmaFeatures': {
      'jsx': true
    },
    'project': path.resolve(__dirname, './tsconfig.json')
  },
  'settings': {
    'react': {
      'version': 'detect'
    },
  },
  'rules': {
    '@typescript-eslint/await-thenable': 'error',
    '@typescript-eslint/camelcase': ['error', { 'properties': 'always' }],
    '@typescript-eslint/type-annotation-spacing': 'error',
    '@typescript-eslint/no-unused-vars': 'error',
    '@typescript-eslint/semi': 'error',
    'camel-case': 'off', //off for @typescript-eslint rule
    'indent': 'off', //off for @typescript-eslint rule
    'no-dupe-keys': 'error',
    'no-extra-bind': 'error',
    'no-implied-eval': 'error',
    'no-global-assign': 'error',
    'no-script-url': 'error',
    'no-sequences': 'error',
    'no-self-compare': 'error',
    'no-throw-literal': 'error',
    'no-useless-call': 'error',
    'no-useless-concat': 'error',
    'no-unused-expressions': 'error',
    'no-unused-vars': 'off', //off for @typescript-eslint rule
    'no-undef': 'error',
    'no-var': 'error',
    'notice/notice': [
      'error',
      {
        'mustMatch': 'Copyright 20\\d{2} The AMP HTML Authors\\.',
        'templateFile': path.resolve(__dirname, '../build-system/LICENSE-TEMPLATE.txt'),
        'messages': {
          'whenFailedToMatch': 'Missing or incorrect license header'
        }
      }
    ],
    'object-shorthand': 'error',
    'prettier/prettier': 'error',
    'prefer-const': 'error',
    'semi': 'off', //off for @typescript-eslint rule
    'sort-imports-es6-autofix/sort-imports-es6': [
      'error',
      {
        'ignoreCase': false,
        'ignoreMemberSort': false,
        'memberSyntaxSortOrder': ['none', 'all', 'multiple', 'single']
      }
    ],
  },
  'overrides': [
    {
      'files': ['webpack.*.config.js'],
      'rules': {
        '@typescript-eslint/no-var-requires': 'off'
      },
    }
  ],
}
