AMP On-Duty Bot
==============

A GitHub App that updates the teams `@ampproject/release-onduty` and `@ampproject/build-cop` according to the current rotation.

This app runs as a Google Cloud Functions deployment.

Interface
---------

The AMP On-Duty bot listens for reports from an internal tool containing the rotation details. Whenever the rotation changes, it updates a corresponding GitHub team to contain the primary and secondary for each rotation.

The bot receives reports of the form:

```
{
  "build-cop": {
    "primary": "<username>",
    "secondary": "<username>"|null
  },
  "release-on-duty": {
    "primary": "<username>"
    "secondary": "<username>"|null
  }
}
```

Setup
-----

1. Clone this repository and `cd` into the `onduty` directory.
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

This GitHub App is deployed as a [Google Cloud Function](https://cloud.google.com/functions/docs/) at the endpoint: https://us-central1-amp-onduty-bot.cloudfunctions.net/
