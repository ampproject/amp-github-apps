/**
 * Copyright 2020 The AMP HTML Authors.
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

import {Application, Context} from 'probot';
import {createTokenAuth} from '@octokit/auth';
import Webhooks from '@octokit/webhooks';
import {Octokit} from '@octokit/rest';

import {InviteBot} from './src/invite_bot';

type WebhookHandler<T> = (inviteBot: InviteBot, payload: T ) => Promise<void>;

type CommentWebhookPayload =
  | Webhooks.WebhookPayloadIssues
  | Webhooks.WebhookPayloadIssueComment
  | Webhooks.WebhookPayloadPullRequest
  | Webhooks.WebhookPayloadPullRequestReview
  | Webhooks.WebhookPayloadPullRequestReviewComment;

export default (app: Application) => {
  if (process.env.NODE_ENV !== 'test') {
    require('dotenv').config();
  }

  const github = new Octokit({
    authStrategy: createTokenAuth,
    auth: process.env.GITHUB_ACCESS_TOKEN,
  });

  /** Listens for webhooks and provides a bot instance to the handler. */
  function listen(
    events: string | Array<string>,
    handler: WebhookHandler<any>
  ) {
    app.on(events, async ({event, payload, log}: Context) => {
      await handler(
        new InviteBot(github, payload.organization.login, log),
        payload
      );
    });
  }

  listen('issue_comment.created', async (
    inviteBot: InviteBot,
    payload: Webhooks.WebhookPayloadIssueComment,
  ) => {
      await inviteBot.processComment(
        payload.repository.name,
        payload.issue.number,
        payload.comment.body,
      );
    }
  );

  listen('issues.opened', async (
    inviteBot: InviteBot,
    payload: Webhooks.WebhookPayloadIssues,
  ) => {
      await inviteBot.processComment(
        payload.repository.name,
        payload.issue.number,
        payload.issue.body,
      );
    }
  );

  listen('pull_request.opened', async (
    inviteBot: InviteBot,
    payload: Webhooks.WebhookPayloadPullRequest,
  ) => {
      await inviteBot.processComment(
        payload.repository.name,
        payload.pull_request.number,
        payload.pull_request.body,
      );
    }
  );

  listen('pull_request_review.submitted', async (
    inviteBot: InviteBot,
    payload: Webhooks.WebhookPayloadPullRequestReview,
  ) => {
      await inviteBot.processComment(
        payload.repository.name,
        payload.pull_request.number,
        payload.review.body,
      );
    }
  );

  listen('pull_request_review_comment.created', async (
    inviteBot: InviteBot,
    payload: Webhooks.WebhookPayloadPullRequestReviewComment,
  ) => {
      await inviteBot.processComment(
        payload.repository.name,
        payload.pull_request.number,
        payload.comment.body,
      );
    }
  );

  listen('organization.member_added', async (
    inviteBot: InviteBot,
    payload: Webhooks.WebhookPayloadOrganization,
  ) => {
    await inviteBot.processAcceptedInvite(payload.membership.user.login);
  }
  );
};
