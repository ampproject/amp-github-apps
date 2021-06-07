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

import {Probot, ApplicationFunctionOptions} from 'probot';
import express from 'express';
import {PullRequest} from './github';
import {decompressAndMove} from './zipper';
import {Octokit} from '@octokit/rest';

const BASE_URL = `https://storage.googleapis.com/${process.env.SERVE_BUCKET}/`;

/**
 * Creates or resets the GitHub PR Deploy check
 * when a pull request is opened or synchronized.
 */
function initializeCheck(app: Probot) {
  app.on(
    [
      'pull_request.opened',
      'pull_request.synchronize',
      'pull_request.reopened',
    ],
    async context => {
      const pr = new PullRequest(
        context.octokit,
        context.payload.pull_request.head.sha
      );
      return pr.createOrResetCheck();
    }
  );
}

/**
 * Listens to the HTTP post route from CI to know when binary upload is
 * complete. When received, updates the PR check status to 'complete' so that
 * the check run action to deploy site is enabled.
 */
function initializeRouter(app: Probot, router: express.Router) {
  const github: Promise<Octokit> = app.auth(
    Number(process.env.INSTALLATION_ID)
  );
  router.use(express.json());
  router.use(async(request, response, next) => {
    response.locals.github = await github;
    next();
  });

  router.post('/:headSha/success/:externalId', async(request, response) => {
    const {headSha, externalId} = request.params;
    const pr = new PullRequest(response.locals.github, headSha);
    await pr.buildCompleted(externalId);
    response.status(200).end();
  });

  router.post('/:headSha/errored', async(request, response) => {
    const {headSha} = request.params;
    const pr = new PullRequest(response.locals.github, headSha);
    await pr.buildErrored();
    response.status(200).end();
  });

  router.post('/:headSha/skipped', async(request, response) => {
    const {headSha} = request.params;
    const pr = new PullRequest(response.locals.github, headSha);
    await pr.buildSkipped();
    response.status(200).end();
  });
}

/**
 * Creates a listener that deploys the PR branch to gs://amp-test-website-1/<pull_request_id>
 * when the 'Deploy me!' button is clicked.
 */
function initializeDeployment(app: Probot) {
  app.on('check_run.requested_action', async context => {
    if (context.payload.check_run.name != process.env.GH_CHECK) {
      return;
    }

    const pr = new PullRequest(
      context.octokit,
      context.payload.check_run.head_sha
    );
    try {
      const {data: checkData} = await pr.deploymentInProgress();
      const bucketUrl = await decompressAndMove(
        pr.headSha,
        checkData.external_id
      );
      await pr.deploymentCompleted(
        bucketUrl,
        `${BASE_URL}amp_nomodule_${pr.headSha}/`
      );
    } catch (e) {
      await pr.deploymentErrored(e);
    }
  });
}

const prDeployAppFn = (app: Probot, {getRouter}: ApplicationFunctionOptions) => {
  initializeCheck(app);
  initializeRouter(app, getRouter('/v0/pr-deploy/headshas'));
  initializeDeployment(app);  
};

export default prDeployAppFn;
module.exports = prDeployAppFn;
