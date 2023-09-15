/**
 * Copyright 2020 The AMP HTML Authors. All Rights Reserved.
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

import {EmitterWebhookEvent} from '@octokit/webhooks';
import {Probot} from 'probot';
import {WebhookEventMap, WebhookEventName} from '@octokit/webhooks-types';
import fs from 'fs';
import path from 'path';

type SampleWebhookEvent = {
  event: WebhookEventName;
  payload: WebhookEventMap[WebhookEventName];
};

/**
 * Get a JSON test fixture object.
 */
export function getFixture<T>(name: string): T {
  return JSON.parse(
    fs.readFileSync(path.join(__dirname, `${name}.json`)).toString('utf8')
  ) as T;
}

export function getOctokitResponse<T, R>(
  name: string,
  status: number = 200
): T {
  return {
    data: getFixture<R>(name),
    status,
  } as T;
}

/**
 * Triggers a Probot webhook event using a payload from `fixtures/`.
 */
export async function triggerWebhook(
  probot: Probot,
  eventName: string
): Promise<void> {
  const {event, payload} = getFixture<SampleWebhookEvent>(eventName);
  await probot.receive({
    name: event,
    id: '', // required by type definition.
    payload,
  } as EmitterWebhookEvent);
}
