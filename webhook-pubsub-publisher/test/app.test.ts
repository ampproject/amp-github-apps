/**
 * Copyright 2021 The AMP HTML Authors. All Rights Reserved.
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

import {Probot} from 'probot';
import {PubSub} from '@google-cloud/pubsub';
import {WebhookEventMap} from '@octokit/webhooks-types';
import probotApplication from '../src/app';

const mockTopic = {
  publishMessage: jest.fn().mockResolvedValue(''),
};
const mockPubSub = {
  topic: jest.fn().mockImplementation(() => mockTopic),
};
jest.mock('@google-cloud/pubsub', () => ({
  PubSub: jest.fn().mockImplementation(() => mockPubSub),
}));

describe('webhook-pubsub-publisher tests', () => {
  let probot: Probot;

  beforeEach(() => {
    probot = new Probot({appId: 1, githubToken: 'test'});
    probot.load(probotApplication);

    process.env = {
      PROJECT_ID: 'cloud-project',
      TOPIC_NAME: 'projects/cloud-project/topics/github',
    };
  });

  it('should publish a received webhook to the Pub/Sub topic', async () => {
    await probot.receive({
      id: '5ae60486-d414-43af-bb35-60d1984b6c44',
      name: 'pull_request',
      payload: {
        action: 'opened',
        'pull_request': {
          head: {sha: '73fe78a999ada1cd5d991129013bab624caa4703'},
        },
        repository: {
          owner: {name: 'test-owner'},
          name: 'test-repo',
        },
      } as WebhookEventMap['pull_request'],
    });

    expect(PubSub).toHaveBeenCalledWith({'projectId': 'cloud-project'});
    expect(mockPubSub.topic).toHaveBeenCalledWith(
      'projects/cloud-project/topics/github'
    );
    expect(mockTopic.publishMessage).toHaveBeenCalledWith({
      json: {
        id: '5ae60486-d414-43af-bb35-60d1984b6c44',
        name: 'pull_request',
        payload: {
          action: 'opened',
          'pull_request': {
            head: {sha: '73fe78a999ada1cd5d991129013bab624caa4703'},
          },
          repository: {
            owner: {name: 'test-owner'},
            name: 'test-repo',
          },
        },
      },
      attributes: {
        'action': 'opened',
        'name': 'pull_request',
      },
      messageId: '5ae60486-d414-43af-bb35-60d1984b6c44',
    });
  });
});
