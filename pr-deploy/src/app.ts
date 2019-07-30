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

import {Application} from 'probot';
import express, {IRouter} from 'express';
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
    const pr = new PullRequest(
      context.github,
      context.payload.pull_request.head.sha,
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
  const router: IRouter<void> = app.route('/v0/pr-deploy');
  router.use(express.json());
  router.post('/travisbuilds/:travisBuild/headshas/:headSha/:result',
    async(request, response) => {
      const {travisBuild, headSha, result} = request.params;
      const github = await app.auth(Number(process.env.INSTALLATION_ID));
      const pr = new PullRequest(github, headSha);
      switch (result) {
        case 'success':
          await pr.buildCompleted(travisBuild);
          break;
        case 'errored':
          await pr.buildErrored();
          break;
        case 'skipped':
        default:
          await pr.buildSkipped();
          break;
      }
      response.send({status: 200});
    });
}

/**
 * Creates a listener that deploys the PR branch to gs://amp-test-website-1/<pull_request_id>
 * when the 'Deploy me!' button is clicked.
 */
function initializeDeployment(app: Application) {
  app.on('check_run.requested_action', async context => {
    if (context.payload.check_run.name != process.env.GH_CHECK) {
      return;
    }

    const pr = new PullRequest(
      context.github,
      context.payload.check_run.head_sha,
    );
    await pr.deploymentInProgress();
    const travisBuild = await pr.getTravisBuildNumber();
    unzipAndMove(travisBuild)
      .then(serveUrl => {
        pr.deploymentCompleted(serveUrl);
      })
      .catch(e => {
        pr.deploymentErrored(e);
      });
  });
}

const prDeployAppFn = (app: Application) => {
  initializeCheck(app);
  initializeRouter(app);
  initializeDeployment(app);
};

export default prDeployAppFn;
module.exports = prDeployAppFn;
