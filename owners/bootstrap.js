/**
 * Copyright 2019 Google Inc.
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

// Keep the components in scope so that, if multiple files include this, the
// bootstrapping is only done once and all files share the components.
let components = null;

/**
 * Bootstraps the required components needed either for starting the full Probot
 * app or just running the info server.
 *
 * @param {Logger=} [logger=console] logging interface.
 * @return {{
 *   github: !GitHub,
 *   repo: !Repository,
 *   ownersBot: !OwnersBot,
 *   initialized: Promise,
 * }}
 */
function bootstrap(logger) {
  if (components === null) {
    if (process.env.NODE_ENV !== 'test') {
      require('dotenv').config();
    }

    const Octokit = require('@octokit/rest');
    const {GitHub} = require('./src/api/github');
    const LocalRepository = require('./src/repo/local_repo');
    const {OwnersBot} = require('./src/owners_bot');

    const {GITHUB_REPO, GITHUB_REPO_DIR, GITHUB_ACCESS_TOKEN} = process.env;
    const [GITHUB_REPO_OWNER, GITHUB_REPO_NAME] = GITHUB_REPO.split('/');

    logger = logger || console;

    const github = new GitHub(
      new Octokit({auth: GITHUB_ACCESS_TOKEN}),
      GITHUB_REPO_OWNER,
      GITHUB_REPO_NAME,
      logger
    );
    const repo = new LocalRepository(GITHUB_REPO_DIR);
    const ownersBot = new OwnersBot(repo);

    const teamsInitialized = ownersBot.initTeams(github);
    const initialized = teamsInitialized
      .then(() => ownersBot.refreshTree(logger))
      .catch(err => {
        logger.error(err);
        process.exit(1);
      });

    components = {ownersBot, github, initialized};
  }

  return components;
}

module.exports = bootstrap;
