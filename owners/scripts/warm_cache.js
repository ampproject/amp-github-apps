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

/**
 * @fileoverview
 *
 * Since the virtual repository relies on a compound cache (in-memory cache
 * for runtime performance backed by a Cloud Storage cache to prevent
 * overloading the GitHub API on app startup), this script warms up the cache by
 * attempting to read each OWNERS file in a slow, rate-limited manner.
 *
 * This file provides a rate limited way to populate the Cloud Storage cache.
 * Once the Cloud Storage cache is warm, the app fetches all OWNERS files at
 * once on initialization.
 */

require('dotenv').config();

const sleep = require('sleep-promise');
const Octokit = require('@octokit/rest');

const {GitHub} = require('../src/api/github');
const VirtualRepository = require('../src/repo/virtual_repo');
const CompoundCache = require('../src//cache/compound_cache');
const {OwnersParser} = require('../src/parser');

const {
  CLOUD_STORAGE_BUCKET,
  GITHUB_ACCESS_TOKEN,
  GITHUB_OWNER,
  GITHUB_REPOSITORY,
} = process.env;
const CACHE_HIT_INTERVAL = 3000;

const github = new GitHub(
  new Octokit({auth: GITHUB_ACCESS_TOKEN}),
  GITHUB_OWNER,
  GITHUB_REPOSITORY,
  console
);
const cache = new CompoundCache(CLOUD_STORAGE_BUCKET);
const repo = new VirtualRepository(github, cache);
const parser = new OwnersParser(repo, {});

repo
  .warmCache(() => sleep(CACHE_HIT_INTERVAL))
  .then(async () => {
    const {result, errors} = await parser.parseOwnersTree();
    errors.forEach(console.error);
    console.log(result.toString());
  });
