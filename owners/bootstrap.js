/**
 * * Copyright 2019 The AMP HTML Authors. All Rights Reserved.
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

const CACHE_WARM_INTERVAL = 1000;
// Keep the components in scope so that, if multiple files include this, the
// bootstrapping is only done once and all files share the components.
let components = null;

/**
 * Bootstraps the required components needed either for starting the full Probot
 * app or just running the info server.
 *
 * @param {Logger} logger logging interface.
 * @return {{
 *   github: !GitHub,
 *   ownersBot: !OwnersBot,
 *   initialized: Promise,
 * }}
 */
function bootstrap(logger = console) {
  if (components === null) {
    if (process.env.NODE_ENV !== 'test') {
      require('dotenv').config();
    }

    const CompoundCache = require('./src/cache/compound_cache');
    const sleep = require('sleep-promise');
    const VirtualRepository = require('./src/repo/virtual_repo');
    const {createTokenAuth} = require('@octokit/auth');
    const {GitHub} = require('./src/api/github');
    const {Octokit} = require('@octokit/rest');
    const {OwnersBot} = require('./src/owners_bot');

    const {
      GITHUB_OWNER,
      GITHUB_REPOSITORY,
      GITHUB_ACCESS_TOKEN,
      CLOUD_STORAGE_BUCKET,
    } = process.env;

    const github = new GitHub(
      new Octokit({
        authStrategy: createTokenAuth,
        auth: GITHUB_ACCESS_TOKEN,
        // hellcat-preview allows team member listings to include nested teams.
        previews: ['hellcat-preview'],
      }),
      GITHUB_OWNER,
      GITHUB_REPOSITORY,
      logger
    );
    const repo = new VirtualRepository(
      github,
      new CompoundCache(CLOUD_STORAGE_BUCKET)
    );
    const ownersBot = new OwnersBot(repo);

    const initialized = Promise.all([
      ownersBot.initTeams(github),
      repo.warmCache(() => sleep(CACHE_WARM_INTERVAL)),
    ])
      .then(() => ownersBot.reparseTree(logger))
      .catch(err => {
        logger.error(err);
        process.exit(1);
      });

    components = {ownersBot, github, initialized};
  }

  return components;
}

module.exports = bootstrap;
