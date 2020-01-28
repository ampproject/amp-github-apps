/**
 * Copyright 2018, the AMP HTML authors
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
'use strict';

const Octokit = require('@octokit/rest');
const {dbConnect} = require('./db');
const {GitHubUtils} = require('./github-utils');
const {installApiRouter} = require('./api');
const {installGitHubWebhooks} = require('./webhooks');

const db = dbConnect();

/**
 * Set up Probot application.
 *
 * @param {!Probot.Application} app base Probot Application.
 */
module.exports = app => {
  const userBasedGithub = new Octokit({
    'auth': process.env.ACCESS_TOKEN,
  });

  const githubUtils = new GitHubUtils(userBasedGithub, app.log);

  installGitHubWebhooks(app, db, githubUtils);
  installApiRouter(app, db, githubUtils);
};
