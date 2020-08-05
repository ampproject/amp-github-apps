AMP Error Monitoring
==============

A GitHub App that files issues for new production errors surfaced by AMP Error Reporting.

This app runs as a Google App Engine deployment. It can be configured for deployment to any organization using Stackdriver error reporting.

Interface
---------

This app exposes a view listing frequent untracked errors seen in AMP releases. Within the resulting list, a button is provided to automatically file a tracking issue for the errror. It looks at the stacktrace, attempts to identify recent editors of lines in the stacktrace, and files a GitHub issue with information about the error.

Setup
-----

1. Clone this repository and `cd` into the `error-monitoring` directory.
2. `npm install`
3. Create a new Google Cloud project and switch to it with `gcloud config set project [PROJECT_NAME].
4. Initialize an App Engine app with `gcloud app create'.
5. Create a new GitHub Personal Access Token with `public_repo` permissions and note the created access token.
6. Enable the [App Engine](https://pantheon.corp.google.com/flows/enableapi?apiid=appengine) API
7. Copy the `redacted.env` file to `.env` and modify the fields based the values from the GitHub App page:
   * The value for the `GITHUB_ACCESS_TOKEN` field is the token from Step 4.

Local Development
-----------------

To compile the TypeScript to JavaScript, run `npm run build`.
> To automatically compile as files are changed, run `npm run build:watch`.

To run tests, run `npm test`.

Deployment
----------

After setting up the app locally, use `gcloud` to deploy the app:

1. Configure the project for the first time: `gcloud init`
2. Deploy the function for the first time: `gcloud app deploy`
3. To configure Cloud Build auto-deployment, follow [this guide](https://github.com/ampproject/amp-github-apps/blob/master/DEPLOYMENT.md)

This GitHub App is deployed as a [Google Cloud Function](https://cloud.google.com/functions/docs/) at the endpoint: https://amp-error-monitoring.appspot.com/
