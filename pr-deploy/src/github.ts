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

import {Octokit} from '@octokit/rest';
import {GitHubAPI} from 'probot/lib/github';


const ACTION: Octokit.ChecksUpdateParamsActions = {
  label: 'Create a test site',
  description: 'Serves the minified output of this PR.',
  identifier: 'deploy-me-action',
};

const check_name = process.env.GH_CHECK;
const owner = process.env.GH_OWNER;
const repo = process.env.GH_REPO;

export class PullRequest {
  private github: Octokit;
  private headSha: string;

  constructor(github: GitHubAPI, headSha: string) {
    this.github = github as unknown as Octokit;
    this.headSha = headSha;
  }

  /**
   * Create or reset the check.
   */
  async createOrResetCheck(): Promise<void> {
    const check = await this.getCheck_();
    check ? await this.resetCheck_(check) : await this.createCheck_();
  }

  /**
   * Set check to 'in_progress' while files are being uploaded.
   */
  async deploymentInProgress() {
    const check = await this.getCheck_();

    const params: Octokit.ChecksUpdateParams = {
      owner,
      repo,
      check_run_id: check.id,
      status: 'in_progress',
      output: {
        title: 'Creating a test site...',
        summary: 'Please wait while a test site is being created. ' +
          'When finished, a link will appear here.',
        text: check.output.text,
      },
    };

    return this.github.checks.update(params);
  }

  /**
   * Set check to 'completed' and remove the 'Deploy Me' action once
   * deployment is finished. Display the serve url in the check's output.
   */
  async deploymentCompleted(bucketUrl: string, serveUrl: string) {
    const check = await this.getCheck_();

    const params: Octokit.ChecksUpdateParams = {
      owner,
      repo,
      check_run_id: check.id,
      status: 'completed',
      actions: [],
      conclusion: 'success',
      details_url: serveUrl,
      output: {
        title: 'Success! A test site was created.',
        summary:
          `You can now access the [**website**](${serveUrl}` +
          'examples/article.amp.html) or browse the deployed ' +
          `[**Google Cloud Platform Bucket**](${bucketUrl}).<br/>` +
          'To browse examples or manual tests, append your specific ' +
          'example/test to the following URL:<br/>' +
          `\`${serveUrl}examples/[YOUR_EXAMPLE_HERE]\`<br/>` +
          '**For example:** You can access the sample [AMP article example]' +
          `(${serveUrl}examples/article.amp.html) at <br/>` +
          `\`${serveUrl}examples/article.amp.html\``,
      },
    };

    return this.github.checks.update(params);
  }

  /**
   * Fail the check if any part of the deployment fails.
   */
  async deploymentErrored(error: Error) {
    const check = await this.getCheck_();

    const params: Octokit.ChecksUpdateParams = {
      owner,
      repo,
      check_run_id: check.id,
      status: 'completed',
      conclusion: 'neutral',
      output: {
        title: 'Deployment error.',
        summary: 'There was an error creating a test site.',
        text: error.message,
      },
      actions: [ACTION],
    };

    return this.github.checks.update(params);
  }

  /**
   * Set check to 'completed' to enable the 'Deploy Me' action.
   */
  async buildCompleted(id: number) {
    const check = await this.getCheck_();

    const params: Octokit.ChecksUpdateParams = {
      owner,
      repo,
      check_run_id: check.id,
      status: 'completed',
      conclusion: 'neutral',
      output: {
        title: 'Ready to create a test site.',
        summary: 'Please click the `Create a test site` button above to ' +
        'deploy the minified build of this PR along with examples from ' +
        '`examples/` and `test/manual/`. It should only take a minute.',
        text: `Travis build number: ${id}`,
      },
      actions: [ACTION],
    };

    return this.github.checks.update(params);
  }

  /**
   * Set check to 'neutral' if dist fails.
   */
  async buildErrored() {
    const check = await this.getCheck_();

    const params: Octokit.ChecksUpdateParams = {
      owner,
      repo,
      check_run_id: check.id,
      status: 'completed',
      conclusion: 'neutral',
      output: {
        title: 'Build error.',
        summary: 'A test site cannot be created because this PR ' +
        'failed to build. Please check the Travis logs for more information.',
      },
    };

    return this.github.checks.update(params);
  }

  /**
   * Set check to 'neutral' if dist is skipped.
   */
  async buildSkipped() {
    const check = await this.getCheck_();

    const params: Octokit.ChecksUpdateParams = {
      owner,
      repo,
      check_run_id: check.id,
      status: 'completed',
      conclusion: 'neutral',
      output: {
        title: 'Build skipped.',
        summary: 'A test site cannot be created because the ' +
         'compilation step was skipped in Travis. This happens when ' +
         'a PR only includes non-code changes, such as documentation. ' +
         'Please check the Travis logs for more information.',
      },
    };

    return this.github.checks.update(params);
  }

  async getTravisBuildNumber() {
    const check = await this.getCheck_();

    if (!check.output || !check.output.text) {
      return -1;
    }

    return Number(check.output.text.replace(/\D/g, ''));
  }

  /**
   * Create the check and set it to 'queued'.
   */
  private async createCheck_() {
    const params: Octokit.ChecksCreateParams = {
      owner,
      repo,
      name: check_name,
      head_sha: this.headSha,
      status: 'queued',
      output: {
        title: 'Waiting for the build to finish...',
        summary: 'When Travis is finished compiling this PR, ' +
          'a "Create a test site!" button will appear here.',
      },
    };

    return this.github.checks.create(params);
  }

  /**
   * Reset the check and set it to 'queued'.
   */
  private async resetCheck_(
    check: Octokit.ChecksListForRefResponseCheckRunsItem) {
    let output: Octokit.ChecksListForRefResponseCheckRunsItemOutput;
    if (check.status == 'completed'
      && check.conclusion == 'success' && check.output.text) {
      output = {
        title: 'A new build is being compiled...',
        summary: `To view the existing test site, visit ${check.output.text} ` +
        'This site will be overwritten if you recreate the test site.',
      } as Octokit.ChecksListForRefResponseCheckRunsItemOutput;
    }

    const params: Octokit.ChecksUpdateParams = {
      owner,
      repo,
      check_run_id: check.id,
      status: 'queued',
      output,
    };
    return this.github.checks.update(params);
  }

  /**
   * Get the check or return null if it does not exist.
   */
  private async getCheck_() {
    const params: Octokit.ChecksListForRefParams = {
      owner,
      repo,
      ref: this.headSha,
      check_name,
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
