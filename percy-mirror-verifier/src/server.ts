/**
 * Copyright 2022 The AMP HTML Authors.
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

import {IncomingMessage, ServerResponse} from 'http';
import crypto from 'crypto';

import 'dotenv/config';
import express from 'express';

import * as github from './github';
import * as percy from './percy';
import * as webhooks from './webhooks';
import {PercyWebhook} from './webhooks';

export function verify(
  req: IncomingMessage,
  res: ServerResponse,
  buffer: Buffer
) {
  const expectedDigest = crypto
    .createHmac('sha256', process.env.PERCY_WEBHOOK_SECRET)
    .update(buffer)
    .digest('hex');
  if (req.headers['x-percy-digest'] !== expectedDigest) {
    throw new Error('Message digest is incorrect for PERCY_WEBHOOK_SECRET');
  }
}

export async function handleBuildFinished(
  included: webhooks.PercyWebhookIncluded[]
): Promise<void> {
  const percyMainBuild = webhooks.getIncluded(included, 'builds');
  if (percyMainBuild.attributes.branch !== 'main') {
    console.log('This build is not a main branch build');
    return;
  }

  try {
    const percyMainBuildId = webhooks.getBuildId(included);
    console.log('Percy build id for main branch:', percyMainBuildId);
    const githubPullNumber = webhooks.getPullNumber(included);
    console.log(
      'Pull request that was merged into this commit:',
      githubPullNumber
    );

    const percyPullBuildId = await github.getPercyBuildId(githubPullNumber);
    console.log('Percy build id for the pull request:', percyPullBuildId);

    const prSnapshots = await percy.getSnapshots(percyPullBuildId);
    const mainSnapshots = await percy.getSnapshots(percyMainBuildId);

    if (prSnapshots.size === 1 && prSnapshots.has('Blank page')) {
      console.log(
        'Pull request',
        githubPullNumber,
        'was a docs-only change. Skipping...'
      );
      return;
    }

    // We ignore the Blank page.
    mainSnapshots.delete('Blank page');

    // Mirroring verification: the following must all be true to indicate a
    // correct mirroring of the PR/main builds:
    // * The number of snapshots on both the PR and main build is equal (after
    //   we remove the "Blank page" snapshot)
    // * The set of snapshot names are equal
    // * All snapshots are approved
    // * All snapshots must have the same approval reason (both are no_diff or
    //   were both approved, manually/automatically)
    // If any of these are false, this indicates a disparity between the PR and
    // main builds.
    if (
      prSnapshots.size != mainSnapshots.size ||
      [...prSnapshots.keys()].some(name => !mainSnapshots.has(name))
    ) {
      // TODO(danielrozenberg): write a comment on the PR (here and below).
      console.error('PR/main disparity: not all snapshots exist in both');
      return await github.postErrorComment(
        githubPullNumber,
        percyMainBuildId,
        percyPullBuildId
      );
    }

    if (
      [...prSnapshots.values(), ...mainSnapshots.values()].some(
        ({attributes}) => attributes['review-state'] !== 'approved'
      )
    ) {
      console.error('PR/main disparity: not all snapshots are marked approved');
      return await github.postErrorComment(
        githubPullNumber,
        percyMainBuildId,
        percyPullBuildId
      );
    }

    for (const [name, prSnapshot] of prSnapshots) {
      const mainSnapshot = mainSnapshots.get(name);

      if (
        prSnapshot.attributes.fingerprint !==
        mainSnapshot.attributes.fingerprint
      ) {
        console.error(
          'PR/main disparity: not all snapshots have the same fingerprint'
        );
        return await github.postErrorComment(
          githubPullNumber,
          percyMainBuildId,
          percyPullBuildId
        );
      }
    }

    console.info('PR/main Percy builds are correctly mirrored!');
  } catch (error) {
    console.error(error);
  }
}

export const app = express();
app.use(
  express.json({
    verify,
  })
);

app.post('/', async ({body}, res) => {
  const {data, included} = body as PercyWebhook;
  try {
    console.group(data.id);
    console.log('webhook %O received from Percy', data.attributes.event);

    if (data.attributes.event !== 'build_finished') {
      return;
    }
    await handleBuildFinished(included);
  } finally {
    console.groupEnd();
    res.end();
  }
});
