/**
 * Copyright 2021 The AMP HTML Authors.
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

import * as dotenv from 'dotenv';
import {PubSub} from '@google-cloud/pubsub';
import type {Context, Probot} from 'probot';

export default (app: Probot): void => {
  if (process.env.NODE_ENV !== 'test') {
    dotenv.config();
  }

  app.onAny(async (context: Context): Promise<void> => {
    context.log(`Received "${context.name}" event with ID ${context.id}`);

    const pubsub = new PubSub({
      projectId: process.env.PROJECT_ID,
    });
    const topic = pubsub.topic(process.env.TOPIC_NAME);
    await topic.publishMessage({
      json: {
        name: context.name,
        id: context.id,
        payload: context.payload,
      },
      attributes: {
        name: context.name,
        action: context.payload.action ?? '',
      },
      messageId: context.id,
    });
  });
};
