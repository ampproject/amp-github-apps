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

module.exports = (app: Application) => {
  if (process.env.NODE_ENV !== 'test') {
    require('dotenv').config();
  }

  const helpUserToTag = process.env.HELP_USER_TO_TAG || null;
  const github = new Octokit({
    authStrategy: createTokenAuth,
    auth: process.env.GITHUB_ACCESS_TOKEN,
  });

  app.on('issue_comment.created', async (
    {event, payload, log}: Context<Webhooks.WebhookPayloadIssueComment>
  ) => {
    const inviteBot = new InviteBot(
      github,
      payload.repository.owner.login,
      helpUserToTag,
      log,
    );
    await inviteBot.processComment(
      payload.repository.name,
      payload.issue.number,
      payload.comment.body,
    );
  });

  app.on('issues.opened', async (
    {event, payload, log}: Context<Webhooks.WebhookPayloadIssues>
  ) => {
    const inviteBot = new InviteBot(
      github,
      payload.repository.owner.login,
      helpUserToTag,
      log,
    );
    await inviteBot.processComment(
      payload.repository.name,
      payload.issue.number,
      payload.issue.body,
    );
  });

  app.on('pull_request.opened', async (
    {event, payload, log}: Context<Webhooks.WebhookPayloadPullRequest>
  ) => {
    const inviteBot = new InviteBot(
      github,
      payload.repository.owner.login,
      helpUserToTag,
      log,
    );
    await inviteBot.processComment(
      payload.repository.name,
      payload.pull_request.number,
      payload.pull_request.body,
    );
  });

  app.on('pull_request_review.submitted', async (
    {event, payload, log}: Context<Webhooks.WebhookPayloadPullRequestReview>
  ) => {
    const inviteBot = new InviteBot(
      github,
      payload.repository.owner.login,
      helpUserToTag,
      log,
    );
    await inviteBot.processComment(
      payload.repository.name,
      payload.pull_request.number,
      payload.review.body,
    );
  });

  app.on('pull_request_review_comment.created', async (
    {event, payload, log}: Context<Webhooks.WebhookPayloadPullRequestReviewComment>
  ) => {
    const inviteBot = new InviteBot(
      github,
      payload.repository.owner.login,
      helpUserToTag,
      log,
    );
    await inviteBot.processComment(
      payload.repository.name,
      payload.pull_request.number,
      payload.comment.body,
    );
  });

  app.on('organization.member_added', async (
    {event, payload, log}: Context<Webhooks.WebhookPayloadOrganization>
  ) => {
    const inviteBot = new InviteBot(
      github,
      payload.organization.login,
      helpUserToTag,
      log,
    );
    await inviteBot.processAcceptedInvite(payload.membership.user.login);
  });
};
