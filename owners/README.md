AMP Owners Bot
==============

A GitHub App that suggests approvers for a GitHub pull request based on OWNERS
files and enforces reviews by OWNERS as a GitHub status check.

This app runs on an instance of Google AppEngine and is currently installed on [ampproject/amphtml](https://github.com/ampproject/amphtml). It can be deployed to other organizations and repositories.

Status/Info Pages
-----------------

* `/status`: Displays the status of the app and links to other pages
* `/example`: Shows the example OWNERS file syntax specification
* `/tree`: Displays the current ownership tree
* `/teams`: Displays the list of known teams and their members

Webhooks
--------

The app subscribes to the following GitHub Webhooks:

* [`PullRequestEvent`](https://developer.github.com/v3/activity/events/types/#pullrequestevent)
  * `opened`: run the owners check and add owners as reviewers
  * `synchronize`: re-run the owners check
  * `closed`: update the owners tree for changed OWNERS files
* [`PullRequestReviewEvent`](https://developer.github.com/v3/activity/events/types/#pullrequestreviewevent)
  * `submitted`: re-run the owners check
* [`CheckRunEvent`](https://developer.github.com/v3/activity/events/types/#pullrequestreviewevent)
  * `rerequested`: re-run the owners check
* [`MembershipEvent`](https://developer.github.com/v3/activity/events/types/#membershipevent)
  * `added`: update the local cache of organization team members
  * `removed`: update the local cache of organization team members
* [`TeamEvent`](https://developer.github.com/v3/activity/events/types/#teamevent)
  * `created`: update the local cache of organization team members
  * `edited`: update the local cache of organization team members
  * `deleted`: update the local cache of organization team members

Cron Tasks
----------

The app provides cron endpoints (reachable only via [Google App Engine Cron Jobs](https://cloud.google.com/appengine/docs/flexible/nodejs/scheduling-jobs-with-cron-yaml)):

* `/_cron/refreshTree`: Re-fetches the list of OWNERS files, updates any caches, and re-parses the ownership tree
* `/_cron/refreshTeams`: Re-fetches the list of teams and team members

Travis API
----------

The app has an API endpoint which may be called from Travis CI tests.

* `/v0/syntax`
  * Accepts a payload with a `path` to an owners file and the `contents` of the file, and responds with `{requestErrors, fileErrors, rules}` results from parsing the OWNERS file being checked.

Setup
-----

1. Clone this repository and cd into the `owners` directory.
2. `npm install`
3. Start a new [Smee channel](https://smee.io/). This can be used to proxy
   GitHub webhooks to your local machine.
4. Create a new [GitHub App](https://github.com/settings/apps/new) with the following settings:
   * General
     * Set _Homepage URL_ to the App Engine instance URL
     * Set _Webhook URL_ to the Smee channel (development) or the App Engine instance URL (production)
     * Set _Webhook Secret_ to any pin of your choice
   * Permissions and Events
     * Set _Checks_ to Read & write
     * Set _Pull requests_ to Read & write
     * Set _Commit statuses_ to Read & write
     * Set _Contents_ to Read-only
     * Set _Issues_ to Read-only
     * Set _Metadata_ to Read-only
     * Set _Members_ to Read-only
     * Subscribe to events: _Check run_, _Pull request_, _Pull request review_, _Team_, and _Membership_
5. After creating the application, generate and download a private key. Also
   take note of the App ID.
6. Create a personal access token belonging to a GitHub _user_ with the
   `public_repo`, `read:org`, and `repo:status` permissions and note its access token.
7. Install the application on a GitHub repository that you want to use for
   testing. You might want to fork the [ampproject/amphtml](https://github.com/ampproject/amphtml) repository or create a new repository for this purpose.
8. Create a Cloud Storage Bucket and generate a JSON credential file for a service account with _Storage Object Admin_ permissions on the bucket.
9. Copy the `.env.example` file to `.env` and modify the fields based on the
   instructions in that file and the values from the GitHub App page:
   * The value for the `APP_ID` field is the App ID from
     Step 5.
   * The value for `WEBHOOK_SECRET` is the secret you set when creating the GitHub app.
   * The value for the `PRIVATE_KEY` field is a base64 representation of the
     `.pem` file you downloaded from the GitHub App page in Step 5. On Linux/Mac you can
     convert that file by running `cat private-key-file.pem | base64` in a
     command line.
   * The value for `GITHUB_ACCESS_TOKEN` is the token generated in step 6.
   * The value for `CLOUD_STORAGE_BUCKET` is the name of the Cloud Storage bucket created in Step 8
   * Update the remaining fields for the organization, repository, and bot for which you are running the app.
11. Warm up the file cache with `npm run init`

If there are no errors after running the last command then the server is running
locally on your machine.

Local Development
-----------------

If you need to receive webhooks locally, make sure the app in GitHub is configured to use the Smee channel as the webhook URL. Set the env variable `WEBHOOK_PROXY_URL` to the Smee channel.

For Cloud Storage access locally, you'll need to set the env variable `GOOGLE_APPLICATION_CREDENTIALS` to an absolute path to the JSON credential file for the service account for the storage bucket.

To run the app locally, run `npm run start`. To run just the info server locally, run `npm run dev`.

Deployment
----------

After setting up the app locally, use `gcloud` to deploy the app and cron tasks:

1. `gcloud init`
2. `gcloud app deploy app.yaml`
3. `gcloud app deploy cron.yaml`


Deployment
----------

This GitHub App is deployed on an AppEngine instance:
https://ampproject-owners-bot.appspot.com/
