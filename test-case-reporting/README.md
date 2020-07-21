AMP Test Case Reporting Bot
==============

A Google Cloud app that stores the results of tests run by Travis. Used to track flaky tests.

This app runs as a [[something]].

Interface
---------
### API for Travis

The App has the following API endpoints, which are to be triggered from Travis CI
runs.

* `POST /report`
  * Accepts a JSON object representing a test result report from Travis. Has 3 fields: `build`, `job`, and `results`, representing build information, job information, and test run information respectively. For the full structure of the object, see [the type declaration module](types/test-case-reporting.d.ts).

Setup
-----

Follow these setup instructions to start developing for this App locally:

1. Clone this repository and cd into the `test-case-reporting` directory
2. `npm install`
3. Create a new Google Cloud project and switch to it with `gcloud config set project [PROJECT_NAME]`.
4. Add an SQL database to the Google Cloud project. Choose a name for the database and store it in the `DB_NAME` field of .env.
5. Initialize an App Engine app with `gcloud app create`.
6. Run a local instance of PostgreSQL, or use the
   [Cloud SQL Proxy](https://cloud.google.com/sql/docs/postgres/sql-proxy)
   * While other database engines might work, this is developed using pg
7. Run `npm run setup-db` to set up the database.
8. Copy the `redacted.env` file to `.env` and modify the fields based on the username and password
   used for the database

Local Development
-----------------

To compile the TypeScript to JavaScript, run `npm run build`.
> To automatically compile as files are changed, run `npm run build:watch`.

To run the app locally, run `npm run start`.
> To automatically reload as files are changed, run `npm run dev`.

To run tests, run `npm test`.

Deployment
----------

After setting up the app locally, use `gcloud` to deploy the app:

1. Configure the project for the first time: `gcloud init`
2. Deploy the app for the first time: `gcloud app deploy`
3. To configure Cloud Build auto-deployment, follow [this guide](https://github.com/ampproject/amp-github-apps/blob/master/DEPLOYMENT.md)

This GitHub App is deployed at the endpoint: https://amp-test-cases.appspot.com/
