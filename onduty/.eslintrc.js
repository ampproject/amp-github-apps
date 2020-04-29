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
  "root": true,
  "plugins": [
    "@typescript-eslint",
    "notice",
    "prettier",
    "sort-imports-es6-autofix"
  ],
  "extends": [
    "prettier/@typescript-eslint",
    "plugin:prettier/recommended"
  ],
  "env": {
    "es6": true,
    "jest": true,
    "node": true
  },
  "ignorePatterns": [
    "node_modules/",
    "dist/"
  ],
  "parser": "@typescript-eslint/parser",
  "parserOptions": {
    "ecmaVersion": 6,
    "sourceType": "module",
    "ecmaFeatures": {
      "modules": true
    },
    "project": path.resolve(__dirname, './tsconfig.json')
  },
  "rules": {
    "curly": 2,
    "indent": "off",
    "no-alert": 2,
    "no-debugger": 2,
    "no-div-regex": 2,
    "no-dupe-keys": 2,
    "no-eval": 2,
    "no-extend-native": 2,
    "no-extra-bind": 2,
    "no-implicit-coercion": [2, { "boolean": false }],
    "no-implied-eval": 2,
    "no-iterator": 2,
    "no-lone-blocks": 2,
    "no-native-reassign": 2,
    "no-redeclare": 2,
    "no-script-url": 2,
    "no-self-compare": 2,
    "no-sequences": 2,
    "no-throw-literal": 2,
    "no-unused-expressions": 0,
    "no-var": 2,
    "no-useless-call": 2,
    "no-useless-concat": 2,
    "no-undef": 2,
    "no-warning-comments": [2, { "terms": ["do not submit"], "location": "anywhere" }],
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
    "prefer-const": 2,
    "radix": 2,
    'sort-imports-es6-autofix/sort-imports-es6': [
      'error',
      {
        'ignoreCase': false,
        'ignoreMemberSort': false,
        'memberSyntaxSortOrder': ['none', 'all', 'multiple', 'single']
      }
    ],
    "@typescript-eslint/no-unused-vars": 2,
    "@typescript-eslint/promise-function-async": 2
  }
};
