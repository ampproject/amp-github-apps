AMP Invite Bot
==============

A GitHub App that invites GitHub users to the an organization based
on GitHub comment macros (ie. `/invite` and `/tryassign`).

This app runs as a Google Cloud Functions deployment. It can be configured for deployment to any organization.

Interface
---------

The AMP Invite Bot watches for all new comments and checks each one for trigger
commands. The known trigger commands are as follows:

- `/invite @user`: Sends an organization invite to `@user`; when the invite is accepted, the bot adds a comment to the original thread indicating as much
- `/tryassign @user`: Performs the same actions as above; when the invite is
accepted, the bot will also attempt to assign the user to the PR or issue
thread the invite was triggered on

Webhooks
--------

The app subscribes to the following GitHub Webhooks:

> Note: This app does not attempt to catch comments which are edited to add an invite macro; this allows simpler stateless processing without potentially re-issuing invitations if comments are edited

* [`IssueCommentEvent`](https://developer.github.com/v3/activity/events/types/#issuecommentevent)
  * `created`: check the comment for trigger macros
* [`IssueEvent`](https://developer.github.com/v3/activity/events/types/#issueevent)
  * `opened`: check the issue body for trigger macros
* [`PullRequestEvent`](https://developer.github.com/v3/activity/events/types/#pullrequestevent)
  * `created`: check the PR description for trigger macros
* [`PullRequestReviewEvent`](https://developer.github.com/v3/activity/events/types/#pullrequestreviewevent)
  * `submitted`: check the review body for trigger macros
* [`PullRequestReviewCommentEvent`](https://developer.github.com/v3/activity/events/types/#pullrequestreviewcommentevent)
  * `created`: check the review comment for trigger macros
* [`OrganizationEvent`](https://developer.github.com/v3/activity/events/types/#organizationevent)
  * `member_added`: comment on the original invite comment, and possibly assign a corresponding issue, to a member who accepts her invitation

Setup
-----

1. Clone this repository and `cd` into the `invite` directory.
2. `npm install`
3. Start a new [Smee channel](https://smee.io/). This can be used to proxy
   GitHub webhooks to your local machine.
4. Create a new [GitHub App](https://github.com/settings/apps/new) with the following settings:
   * General
     * Set _Homepage URL_ to the repository URL
     * Set _Webhook URL_ to the Smee channel (development) or the Google Cloud Function URL `https://[REGION]-[PROJECT_NAME].cloudfunctions.net/[FUNCTION_NAME]` (production)
     * Set _Webhook Secret_ to any high-entropy string of your choice
   * Permissions and Events
     * Repository permissions
       * Set _Issues_ to Read & write
       * Set _Pull requests_ to Read & write
     * Organization permissions
       * Set _Members_ to Read & write
     * Subscribe to events: _Issues_, _Issue comment_, _Organization_, _Pull request_, _Pull request review_, and _Pull request review comment_
5. After creating the application, generate and download a private key. Also
   take note of the App ID and app Client Secret.
6. Install the application on a GitHub repository that you want to use for
   testing. You might want to fork the [ampproject/amphtml](https://github.com/ampproject/amphtml) repository or create a new repository for this purpose.
7. Run a local instance of PostgreSQL, or use the [Cloud SQL Proxy](https://cloud.google.com/sql/docs/postgres/sql-proxy) to connect to a [Cloud SQL instance](https://pantheon.corp.google.com/sql/choose-instance-engine?project=ampproject-invite-bot)
   * While other database engines might work, we have only tested this on `pg`
   * Take note of the instance ID and default user password.
8. Enable the [Cloud SQL Admin](https://pantheon.corp.google.com/flows/enableapi?apiid=sqladmin) and [Cloud Functions](https://pantheon.corp.google.com/flows/enableapi?apiid=cloudfunctions) APIs
9. Copy the `redacted.env` file to `.env` and modify the fields based the values from the GitHub App page:
   * The value for the `APP_ID` field is the App ID from Step 5.
   * The value for `WEBHOOK_SECRET` is the secret you set when creating the GitHub app.
   * The value for the `PRIVATE_KEY` field is a base64 representation of the
     `.pem` file you downloaded from the GitHub App page in Step 5. On Linux/Mac you can convert that file by running `cat private-key-file.pem | base64` in a command line.
   * The value for `GITHUB_ACCESS_TOKEN` is the Client Secret obtained in Step 5.
   * The value for `GITHUB_ORG` to the name of the GitHub organization the bot will be inviting users to.
   * The values for `DB_USER`, `DB_PASSWORD`, and `DB_NAME` will be the values used or created during step 7.
   * The value for `DB_UNIX_SOCKET` will be `/cloudsql/[CLOUD_SQL_INSTANCE_NAME]`; the instance name can be found on the [Instances page](https://pantheon.corp.google.com/sql/instances) and is of the form `project-name:region:database-instance-name`
10. Create the database tables by running `npm run setup-db`

Local Development
-----------------

If you need to receive webhooks locally, make sure the app in GitHub is configured to use the Smee channel as the webhook URL. Set the env variable `WEBHOOK_PROXY_URL` to the Smee channel URL.

You will also need to either set up a local PostgresQL instance or a Cloud SQL instance and a Cloud SQL Unix Proxy.

To run the app locally, run `npm run start`.

Deployment
----------

After setting up the app locally, use `gcloud` to deploy the app and cron tasks:

1. Configure the project for the first time: `gcloud init`
2. Deploy the function for the first time:
    ```
    gcloud functions deploy [FUNCTION_NAME] \
      --entry-point probot \
      --runtime nodejs10 \
      --trigger-http
    ```
    * When deploying after the first time, the `--runtime` and `--trigger-http` flags may be omitted
3. To configure Cloud Build auto-deployment, follow [this guide](https://github.com/ampproject/amp-github-apps/blob/master/DEPLOYMENT.md)

This GitHub App is deployed as a [Google Cloud Function](https://cloud.google.com/functions/docs/) at the endpoint: https://ampproject-invite-bot.cloudfunctions.net/
