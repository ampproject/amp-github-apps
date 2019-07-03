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

import {Octokit} from 'probot';
import {ChecksListForRefParams, ChecksUpdateParams} from '@octokit/rest';
import {GitHubAPI} from 'probot/lib/github';

export class PullRequest {
  private check: string;
  private github: GitHubAPI;
  public headSha: string;
  private owner: string;
  private repo: string;

  constructor(github: GitHubAPI, headSha: string, owner: string, repo: string) {
    this.check = 'pr-deploy-check';
    this.github = github;
    this.headSha = headSha;
    this.owner = owner;
    this.repo = repo;
  }

  /**
   * Create or reset the check.
   */
  async createOrResetCheck(): Promise<void> {
    const check = await this.getCheck_();
    check ? await this.resetCheck_(check) : await this.createCheck_();
  }

  /**
   * Set check to 'completed' to enable the 'Deploy Me' action.
   */
  async enableDeploymentCheck() {
    const check = await this.getCheck_();

    const params: ChecksUpdateParams = {
      owner: this.owner,
      repo: this.repo,
      check_run_id: check.id,
      status: 'completed',
      conclusion: 'neutral',
      output: {
        title: 'Your PR was compiled!',
        summary: 'Please click \'Deploy Me!\' to test it on a live demo site',
      },
      actions: [{
        label: 'Deploy me!',
        description: 'Trigger PR deployment',
        identifier: 'deploy-me-action',
      }],
    };

    return this.github.checks.update(params);
  }

  /**
   * Set check to 'in_progress' while files are being uploaded.
   */
  async inProgressDeploymentCheck() {
    const check = await this.getCheck_();

    const params: ChecksUpdateParams = {
      owner: this.owner,
      repo: this.repo,
      check_run_id: check.id,
      status: 'in_progress',
    };

    return this.github.checks.update(params);
  }

  /**
   * Set check to 'completed' and remove the 'Deploy Me' action once
   * deployment is finished. Display the serve url in the check's output.
   */
  async completeDeploymentCheck(serveUrl: string) {
    const check = await this.getCheck_();

    const params: ChecksUpdateParams = {
      owner: this.owner,
      repo: this.repo,
      check_run_id: check.id,
      status: 'completed',
      actions: [],
      conclusion: 'success',
      details_url: serveUrl,
      output: {
        title: 'Your PR was deployed!',
        summary: `You can find it here: ${serveUrl}`,
      },
    };

    return this.github.checks.update(params);
  }

  /**
   * Create the check and set it to 'queued'.
   */
  private async createCheck_() {
    const params: Octokit.ChecksCreateParams = {
      owner: this.owner,
      repo: this.repo,
      name: this.check,
      head_sha: this.headSha,
      status: 'queued',
      output: {
        title: 'Your PR is compiling...',
        summary: 'When Travis is done compiling your PR, ' +
          'a "Deploy Me!" button will appear here.',
      },
    };

    return this.github.checks.create(params);
  }

  /**
   * Reset the check and set it to 'queued'.
   */
  private async resetCheck_(
    check: Octokit.ChecksListForRefResponseCheckRunsItem) {
    const params: ChecksUpdateParams = {
      owner: this.owner,
      repo: this.repo,
      check_run_id: check.id,
      status: 'queued',
    };
    return this.github.checks.update(params);
  }

  /**
   * Get the check or return null if it does not exist.
   */
  private async getCheck_() {
    const params: ChecksListForRefParams = {
      owner: this.owner,
      repo: this.repo,
      ref: this.headSha,
      check_name: this.check,
    };

    const checks = await this.github.checks.listForRef(params);
    if (!checks || !checks.data || checks.data.total_count != 1) {
      return null;
    }

    return checks.data.check_runs[0];
  }
}

module.exports = {
  PullRequest,
};

