# AMP Contribution Checklist Bot

A GitHub app which posts checklists for [contribution process](https://go.amp.dev/contribute/code) on pull requests:

```markdown
- [ ] My pull request has an intent-to-implement issue (I2I).
- [ ] My I2I was approved during design review.
- [ ] ...
```

This app runs as a Google Cloud Functions deployment. It can be configured for deployment to any organization.

## Interface

The AMP Contribution Checklist Bot watches for all newly opened pull requests.

If the pull request includes a new directory in `extensions/`, the bot will:

1. Append a checklist to the pull request's description.
2. Post a comment on the pull request.

## Webhooks

The app subscribes to the following GitHub Webhooks:

- [`PullRequestEvent`](https://developer.github.com/v3/activity/events/types/#pullrequestevent)
  - `opened`: skips drafts, may add checklist to pull request
  - `ready_for_review`: may add checklist to pull request

## Setup

1. Clone this repository and `cd` into the `checklist` directory.
2. `npm install`
3. Start a new [Smee channel](https://smee.io/). This can be used to proxy
   GitHub webhooks to your local machine.
4. Create a new [GitHub App](https://github.com/settings/apps/new) with the following settings:
   - General
     - Set _Homepage URL_ to the repository URL
     - Set _Webhook URL_ to the Smee channel (development) or the Google Cloud Function URL `https://[REGION]-[PROJECT_NAME].cloudfunctions.net/[FUNCTION_NAME]` (production)
     - Set _Webhook Secret_ to any high-entropy string of your choice
   - Permissions and Events
     - Repository permissions
       - Set _Contents_ to Read
       - Set _Pull requests_ to Read & write
     - Subscribe to events: _Pull request_
5. After creating the application, generate and download a private key. Also
   take note of the App ID and app Client Secret.
6. Install the application on a GitHub repository that you want to use for
   testing. You might want to fork the [ampproject/amphtml](https://github.com/ampproject/amphtml) repository or create a new repository for this purpose.
7. Copy the `redacted.env` file to `.env` and modify the fields based the values from the GitHub App page:
   - The value for the `APP_ID` field is the App ID from Step 5.
   - The value for `WEBHOOK_SECRET` is the secret you set when creating the GitHub app.
   - The value for the `PRIVATE_KEY` field is a base64 representation of the
     `.pem` file you downloaded from the GitHub App page in Step 5. On Linux/Mac you can convert that file by running `cat private-key-file.pem | base64` in a command line.

## Local Development

If you need to receive webhooks locally, make sure the app in GitHub is configured to use the Smee channel as the webhook URL. Set the env variable `WEBHOOK_PROXY_URL` to the Smee channel URL.

To run the app locally, run `npm run start`.

## Deployment

After setting up the app locally, use `gcloud` to deploy the app and cron tasks:

1. Configure the project for the first time: `gcloud init`
2. Deploy the function for the first time:
   ```
   gcloud functions deploy [FUNCTION_NAME] \
     --entry-point probot \
     --runtime nodejs10 \
     --trigger-http
   ```
   - When deploying after the first time, the `--runtime` and `--trigger-http` flags may be omitted
3. To configure Cloud Build auto-deployment, follow [this guide](https://github.com/ampproject/amp-github-apps/blob/master/DEPLOYMENT.md)

This GitHub App is deployed as a [Google Cloud Function](https://cloud.google.com/functions/docs/) at the endpoint: https://ampproject-checklist-bot.cloudfunctions.net/ (**TODO:** URL unavailable, this will be deployed)
