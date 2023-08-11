/**
 * Copyright 2018 The AMP HTML Authors. All Rights Reserved.
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
'use strict';

/**
 * Get the GitHub Check object from the database.
 *
 * @param {!Knex} db database connection.
 * @param {string} headSha commit SHA of the head commit of a pull request.
 * @return {?object} GitHub Check object.
 */
exports.getCheckFromDatabase = async (db, headSha) => {
  const check = await db('checks')
    .first(
      'head_sha',
      'pull_request_id',
      'installation_id',
      'owner',
      'repo',
      'check_run_id',
      'approving_teams',
      'report_markdown'
    )
    .where('head_sha', headSha);
  if (check) {
    check.check_run_id = Number(check.check_run_id);
  }
  return check;
};

/**
 * Format the bundle size delta in "Δ 99.99KB" format.
 *
 * Always fixed with 2 digits after the dot, preceded with a plus or minus sign.
 *
 * @param {number} delta the bundle size delta in KB.
 * @return {string} formatted bundle size delta.
 */
const formatBundleSizeDelta = delta => {
  return 'Δ ' + (delta >= 0 ? '+' : '') + delta.toFixed(2) + 'KB';
};

/**
 * @param {string} file
 * @param {string} description
 * @return {string}
 */
const formatFileItem = (file, description) => `* \`${file}\`: ${description}`;

exports.formatFileItem = formatFileItem;

/**
 * @param {{file: string, bundleSizeDelta: number}} item
 * @return {string}
 */
exports.formatBundleSizeItem = ({file, bundleSizeDelta}) => {
  return formatFileItem(file, formatBundleSizeDelta(bundleSizeDelta));
};

/**
 * @param {string} file
 * @return {string}
 */
const noExtension = file => {
  const parts = file.split('.');
  parts.pop();
  return parts.join('.');
};

/**
 * @param {{file: string, bundleSizeDelta: number}[]} items
 * @param {'asc'|'desc'} sizeOrder
 * @return {{file: string, bundleSizeDelta: number}[]}
 */
function sortBundleSizeItems(items, sizeOrder = 'desc') {
  const bySize = (a, b) => {
    const factor = sizeOrder === 'desc' ? -1 : 1;
    return factor * (a.bundleSizeDelta - b.bundleSizeDelta);
  };
  // group by filename without extension, so that '.mjs' is always next to its
  // equivalent '.js'
  const groups = {};
  for (const item of items) {
    const name = noExtension(item.file);
    const group = (groups[name] = groups[name] || {
      items: [],
      bundleSizeDelta: item.bundleSizeDelta,
    });
    group.items.push(item);
    group.bundleSizeDelta =
      sizeOrder === 'desc'
        ? Math.max(group.bundleSizeDelta, item.bundleSizeDelta)
        : Math.min(group.bundleSizeDelta, item.bundleSizeDelta);
  }
  return Object.values(groups)
    .sort(bySize)
    .map(({items}) => items.sort(bySize))
    .flat();
}

exports.sortBundleSizeItems = sortBundleSizeItems;
