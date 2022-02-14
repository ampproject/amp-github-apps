/**
 * Copyright 2022 The AMP HTML Authors. All Rights Reserved.
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

import {Octokit} from '@octokit/rest';
import dedent from 'dedent';

const octokit = new Octokit({auth: process.env.GITHUB_ACCESS_TOKEN});
const params = {
  owner: 'ampproject',
  repo: 'amphtml',
};

export async function getPercyBuildId(prNumber: number): Promise<number> {
  const pr = await octokit.pulls.get({
    ...params,
    'pull_number': Number(prNumber),
  });
  const statuses = await octokit.repos.listCommitStatusesForRef({
    ...params,
    ref: pr.data.head.sha,
  });
  const percyStatus = statuses.data.find(status =>
    status.context.startsWith('percy/')
  );

  const [, percyBuildId] = percyStatus.target_url.match(
    /^https:\/\/percy\.io\/\w+\/\w+\/builds\/(\d+).*$/
  );
  return Number(percyBuildId);
}

export async function postErrorComment(
  prNumber: number,
  percyMainBuildId: number,
  percyPullBuildId: number
): Promise<void> {
  console.log(
    'The Percy build for pull request',
    prNumber,
    'does not look like the Percy build for the merged commit on the main branch'
  );

  await octokit.issues.createComment({
    ...params,
    'issue_number': prNumber,
    body: dedent`
      **Warning**: disparity between this PR Percy build and its \`main\` build

      The Percy build for this PR was approved (either manually by a member of the AMP team, or automatically if there were no visual diffs). However, during a continuous integration step we generated another Percy build using the commit on the \`main\` branch that this PR was merged into, and there appears to be a mismatch between the two.

      This is possibly an indication of an issue with this pull request, but could also be the result of flakiness. Please inspect the two builds < [This PR's Percy build](https://percy.io/ampproject/amphtml/builds/${percyPullBuildId}) / [\`main\` commit's Percy build](https://percy.io/ampproject/amphtml/builds/${percyMainBuildId}) > and determine further action:
      * If the disparity appears to be caused by this PR, please create an [bug report](https://github.com/ampproject/amphtml/issues/new/choose) or send out a new PR to fix
      * If the disparity appears to be a flake, please @-mention \`ampproject/wg-approvers\` in a comment
      * If there is no disparity and this comment was created by mistake, please @-mention \`ampproject/wg-infra\`
      * If unsure, @-mention \`ampproject/wg-approvers\``,
  });
}
