/**
 * Copyright 2019 The AMP HTML Authors. All Rights Reserved.
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

import {Application, ApplicationFunction} from 'probot';
import {IRouter} from 'express';
import {PullRequest} from './github';
import {unzipAndMove} from './zipper';

/**
 * Creates or resets the GitHub PR Deploy check
 * when a pull request is opened or synchronized.
 */
function initializeCheck(app: Application) {
  app.on([
    'pull_request.opened',
    'pull_request.synchronize',
    'pull_request.reopened',
  ], async context => {
    //TODO: fix this context typing becuase merge_commit_sha IS NULL!
    const pr = new PullRequest(
      context.github,
      context.payload.pull_request.head.sha,
      context.repo().owner,
      context.repo().repo
    );
    return pr.createOrResetCheck();
  });
}

/**
 * Listens to the HTTP post route from Travis to know when dist upload is complete.
 * When received, updates the PR check status to 'complete'
 * so that the check run action to deploy site is enabled.
 */
function initializeRouter(app: Application) {
  const router: IRouter<void> = app.route('/pr-deploy');
  router.use(require('express').json());
  router.post('/owners/:owner/repos/:repo/headshas/:headSha',
    async(request, response) => {
      const github = await app.auth();
      const {headSha, owner, repo} = request.params;
      const pr = new PullRequest(github, headSha, owner, repo);
      await pr.enableDeploymentCheck();
      response.send({status: 200});
    });
}

/**
 * Deploys the PR branch to gs://amp-test-website-1/<pull_request_id>
 */
function initializeDeployment(app: Application) {
  app.on('check_run.requested_action', async context => {
    if (context.payload.action != 'deploy-me-action') {
      return;
    }

    const pr = new PullRequest(
      context.github,
      context.payload.check_run.head_sha,
      context.repo().owner,
      context.repo().repo,
    );

    pr.inProgressDeploymentCheck();

    const pullRequestId = context.payload.repository.id;
    const serveUrl = await unzipAndMove(pullRequestId);

    pr.completeDeploymentCheck(serveUrl);
  });
}

export const prDeployAppFn: ApplicationFunction = (app: Application) => {
  initializeCheck(app);
  initializeRouter(app);
  initializeDeployment(app);
};

module.exports = {prDeployAppFn};
