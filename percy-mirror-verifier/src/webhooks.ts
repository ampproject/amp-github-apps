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

export type PercyWebhookDataPing = {
  type: 'webhook-deliveries';
  id: string;
  attributes: {event: 'ping'};
};

export type PercyWebhookDataBuildFinished = {
  type: 'webhook-deliveries';
  id: string;
  attributes: {
    state: 'finished';
    'total-comparisons-finished': number;
    'total-comparisons-diff': number;
    event: 'build_finished';
  };
  relationships: {
    build: {
      data: {
        type: 'builds';
        id: string;
      };
    };
    commit: {
      data: {
        type: 'commits';
        id: string;
      };
    };
  };
};

export type PercyWebhookData =
  | PercyWebhookDataPing
  | PercyWebhookDataBuildFinished;

export type PercyWebhookIncludedBuilds = {
  type: 'builds';
  id: string;
  attributes: {
    branch: string;
    'build-number': number;
    'review-state':
      | 'approved'
      | 'unreviewed'
      | 'changes_requested'
      | 'failed'
      | null;
    'is-pull-request': boolean;
  };
};

export type PercyWebhookIncludedCommits = {
  type: 'commits';
  id: string;
  attributes: {
    sha: string;
    message: string;
    'author-name': string;
  };
};

export type PercyWebhookIncluded =
  | PercyWebhookIncludedBuilds
  | PercyWebhookIncludedCommits;

export type PercyWebhook = {
  data: PercyWebhookData;
  included: PercyWebhookIncluded[];
};

export function getIncluded(
  included: PercyWebhookIncluded[],
  type: 'builds'
): PercyWebhookIncludedBuilds | undefined;
export function getIncluded(
  included: PercyWebhookIncluded[],
  type: 'commits'
): PercyWebhookIncludedCommits | undefined;

export function getIncluded(
  included: PercyWebhookIncluded[],
  type: 'builds' | 'commits'
): PercyWebhookIncluded | undefined {
  return included.find(include => include.type === type);
}

export function getBuildId(included: PercyWebhookIncluded[]): number {
  const includeBuild = getIncluded(included, 'builds');
  return Number(includeBuild.id);
}

export function getPullNumber(included: PercyWebhookIncluded[]): number {
  const include = getIncluded(included, 'commits');

  const [, prNumber] = include.attributes.message.match(/\(#(\d+)\)$/);
  return Number(prNumber);
}
