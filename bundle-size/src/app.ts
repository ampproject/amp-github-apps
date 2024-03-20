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

import {Octokit} from '@octokit/core';
import {defaultApp} from 'probot/lib/apps/default';
import {restEndpointMethods} from '@octokit/plugin-rest-endpoint-methods';

import {GitHubUtils} from './github-utils';
import {dbConnect} from './db';
import {installApiRouter} from './api';
import {installGitHubWebhooks} from './webhooks';

import type {ApplicationFunction} from 'probot';
import type {RestfulOctokit as RestfulOctokitType} from './types/rest-endpoint-methods';

/**
 * Set up Probot application.
 *
 * @param app base Probot Application.
 * @param getRouter returns an Express Router.
 */
const appFactory: ApplicationFunction = async (
  app,
  {getRouter}
): Promise<void> => {
  if (!getRouter) {
    throw new Error('getRouter is not available');
  }

  const db = await dbConnect();

  const RestfulOctokit = Octokit.plugin(restEndpointMethods);
  const userBasedGithub: RestfulOctokitType = new RestfulOctokit({
    auth: `token ${process.env.ACCESS_TOKEN}`,
  });

  const githubUtils = new GitHubUtils(userBasedGithub, app.log);

  installGitHubWebhooks(app, db, githubUtils);
  installApiRouter(app.log, app.auth, getRouter('/v0'), db, githubUtils);

  // This helps provide a quick health check for the server.
  defaultApp(app, {getRouter});
};

export default appFactory;
