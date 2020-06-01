AMP Error Issue Bot
==============

A GitHub App that files issues for new production errors surfaced by AMP Error Reporting.

This app runs as a Google Cloud Functions deployment. It can be configured for deployment to any organization using Pantheon/Stackdriver error reporting.

Interface
---------

The AMP Error Issue bot responds to requests with data for errors seen in AMP releases. It looks at the stacktrace, attempts to identify recent editors of lines in the stacktrace, and files a GitHub issue with information about the error.

Setup
-----

1. Clone this repository and `cd` into the `error-issue` directory.
2. `npm install`
3. Create a new Pantheon project.
4. Create a new Personal Access Token with `public_repo` permissions and note the created access token.
5. Enable the [Cloud Functions](https://pantheon.corp.google.com/flows/enableapi?apiid=cloudfunctions) API
6. Copy the `redacted.env` file to `.env` and modify the fields based the values from the GitHub App page:
   * The value for the `GITHUB_ACCESS_TOKEN` field is the token from Step 4.

Local Development
-----------------

To compile the TypeScript to JavaScript, run `npm run build`.
> To automatically compile as files are changed, run `npm run build:watch`.

To run the app locally, run `npm run start`.
> To automatically reload as files are changed, run `npm run dev`.

To run tests, run `npm test`.

Deployment
----------

After setting up the app locally, use `gcloud` to deploy the app and cron tasks:

1. Configure the project for the first time: `gcloud init`
2. Deploy the function for the first time:
    ```
    gcloud functions deploy [FUNCTION_NAME] \
      --source dist/ \
      --entry-point app \
      --runtime nodejs10 \
      --trigger-http
    ```
    * When deploying after the first time, the `--runtime` and `--trigger-http` flags may be omitted
3. To configure Cloud Build auto-deployment, follow [this guide](https://github.com/ampproject/amp-github-apps/blob/master/DEPLOYMENT.md)

This GitHub App is deployed as a [Google Cloud Function](https://cloud.google.com/functions/docs/) at the endpoint: https://us-central1-amp-error-issue-bot.cloudfunctions.net/
