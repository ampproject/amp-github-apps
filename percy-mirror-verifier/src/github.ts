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

export async function postErrorComment(prNumber: number): Promise<void> {
  console.log(
    'The Percy build for pull request',
    prNumber,
    'does not look like the Percy build for the merged commit on the main branch'
  );
  // TODO(danielrozenberg): actually post to GitHub.
}
