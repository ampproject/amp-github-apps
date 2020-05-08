/**
 * Copyright 2019 The AMP HTML Authors. All Rights Reserved.
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

exports.installGitHubWebhooks = (app, db) => {
  app.on(['pull_request.opened', 'pull_request.synchronize'], async context => {
    const pullRequestId = context.payload.number;
    context.log(`Pull request ${pullRequestId} created`);

    const headSha = context.payload.pull_request.head.sha;
    try {
      await db('pullRequestSnapshots').insert(
        context.repo({
          headSha,
          pullRequestId,
          installationId: context.payload.installation.id,
        })
      );
    } catch (error) {
      // Usually this is the result of duplicate webhook calls, and thus is a
      // non-fatal failure.
      context.log(
        `ERROR: failed to add snapshot of pull request ${pullRequestId} ` +
          `with head SHA ${headSha} to database: ${error}`
      );
    }
  });
};
