AMP PR Deploy Bot
===================

A GitHub App that deploys a PR branch to a static website when you ask it to. 

Websites are served by a Google Cloud Storage bucket. <br>
This app runs on an instance of Google AppEngine and is installed exclusively on [ampproject/amphtml](https://github.com/ampproject/amphtml).

How the app works
----------------
1. A commit is pushed to a new or existing pull request on ampproject/amphtml.
2. A CI build compiles your changes and uploads the build artifacts and example pages as `amp_dist_<CI build number>.zip` to a remote storage location. During this step, a check called `ampproject/pr-deploy` is set to `pending`.
3. a) If there was a compilation error, the CI build tells the AMP PR Deploy Bot that there's nothing left to do until the error is fixed. <br>
   b) If there were no errors, the CI build tells the AMP PR Deploy Bot that a test site is ready to be deployed. `ampproject/pr-deploy` is now `netural`
4. A test site is deployed by clicking the 'Deploy Me' button in the details page of `ampproject/pr-deploy`. The app unzips and writes `amp_dist_<CI build number>.zip` to the public Google Cloud Storage bucket.
5. `ampproject/pr-deploy` completes with the website URL. `https://console.cloud.google.com/storage/browser/amp-test-website-1/amp_dist_<CI build number>`

Here's a quick [demo](https://github.com/ampproject/amphtml/pull/24274) on how to create a test site.

Local development
-----------------

1. Clone this repository and cd into the `pr-deploy` directory.
2. `npm install`
3. Start a new [Smee channel](https://smee.io/). This can be used to proxy
   GitHub webhooks to your local machine.
4. Create a new [GitHub App](https://github.com/settings/apps/new) with the following settings:
   * General
     * Set _Homepage URL_ to the Smee channel
     * Set _Webhook URL_ to the Smee channel
     * Set _Webhook Secret_ to any pin your choice
   * Permissions and Events
     * Set _Checks_ to Read & write
     * Set _Metadata_ to Read-only
     * Set _Pull requests_ to Read-only
     * Subscribe to events: _Check run_, _Pull request_   
5. After creating the application, generate and download a private key. Also
   take note of the App ID.
6. Create a personal access token belonging to a GitHub _user_ with the
   `public_repo` and `read:org` permissions and note its access token.
7. Install the application on a GitHub repository that you want to use for
   testing. You might want to fork the [ampproject/amphtml](https://github.com/ampproject/amphtml) repository or create a new repository for this purpose.
8. Copy the `.env.example` file to `.env` and modify the fields based on the
   instructions in that file and the values from the GitHub App page:
   * The value for the `PRIVATE_KEY` field is a base64 representation of the
     `.pem` file you downloaded from the GitHub App page in Step 5. On Linux/Mac you can
     convert that file by running `cat private-key-file.pem | base64` in a
     command line.
   * The value for the `APP_ID` field is the App ID from
     Step 5.
   * The value for the `INSTALLATION_ID` can be found when calling `GET /repos/:owner/:repo/installation`, as seen in the [GitHub App docs](https://github.com/octokit/app.js#authenticating-as-an-app)     
9. `npm run dev`

If there are no errors after running the last command then the app is running
locally on your machine.


Deployment
----------

This GitHub App is deployed on an AppEngine instance:
https://amp-pr-deploy-bot.appspot.com