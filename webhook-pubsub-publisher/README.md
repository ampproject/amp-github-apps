# Webhook Pub/Sub Publisher

Publishes received [webhooks from GitHub](https://docs.github.com/en/developers/webhooks-and-events/webhooks) to a [Google Cloud Pub/Sub](https://cloud.google.com/pubsub) topic.

## How the app works

This app is a straight-forward [Probot](https://probot.github.io/) application that does exactly what its description says and nothing more.

[insert patrick-push-it-somewhere-else.gif meme](https://knowyourmeme.com/memes/push-it-somewhere-else-patrick)

## Local development

### GitHub Application setup

1. Start a new [Smee channel](https://smee.io/). This can be used to proxy
   GitHub webhooks to your local machine.
2. Create a new [GitHub App](https://github.com/settings/apps/new) with the following settings:
   - General
     - Set _Homepage URL_ to the Smee channel
     - Set _Webhook URL_ to the Smee channel
     - Set _Webhook Secret_ to any pin your choice
   - Permissions
     - None
   - Events
     - Subscribe to whichever choice events you want to publish
3. After creating the application, generate and download a private key. Also
   take note of the App ID.
4. Install the application on a GitHub repository that you want to use for
   testing

### Google Cloud setup

1. Create a Google Cloud project and add a Cloud Pub/Sub topic to it
2. Authenticate your terminal session with `gcloud auth login` (make sure you
   have the [`gcloud`](https://cloud.google.com/sdk/docs/install) CLI installed)

### Local setup

1. Clone this repository and cd into the `webhook-pubsub-publisher` directory.
2. `npm install`
3. Copy the `redacted.env` file to `.env` and modify the fields based on the
   instructions in that file and the values from the GitHub App page:
   - The value for the `PRIVATE_KEY` field is a base64 representation of the
     `.pem` file you downloaded from the GitHub App setup, Step 3. On Linux/Mac
     you can convert that file by running `cat private-key-file.pem | base64` in
     a command line.
   - The value for the `APP_ID` field is the App ID from GitHub App setup, Step 3.
   - Add `WEBHOOK_PROXY_URL={url of your Smee channel from GitHub App setup, Step 1}`.
4. `npm run dev`

If there are no errors after running the last command then the app is running
locally on your machine.

## Deployment

This GitHub App is deployed as a [Google Cloud Function](https://cloud.google.com/functions/docs/) at the endpoint: https://us-central1-amp-webhook-pubsub-publisher.cloudfunctions.net/webhook
