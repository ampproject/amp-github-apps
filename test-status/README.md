AMP Test Status Bot
===================

This GitHub App reports the status of different test types on the AMPHTML
repository, and allows the build cop to skip flaky tests.

The app runs on an instance of Google AppEngine and is installed exclusively for
the ampproject/amphtml repository.


Interfaces
----------

### GitHub Webhooks

The App subscribes to the following GitHub Webhooks:

* [`PullRequestEvent`](https://developer.github.com/v3/activity/events/types/#pullrequestevent)
  (`opened` and `synchronize` actions)
  * Records the head SHA to enable creating checks on the pull request

### API for Travis

The App has the following API points, which are to be triggered from Travis CI
runs. If the `TRAVIS_IP_ADDRESSES` environment variable is set, only requests
from this comma separated list of IP addresses will be processed.

* `POST /v0/tests/:headSha/:type/:status(queued|started|skipped)`
  * Creates a new check on the supplied head commit (for `status` = `queued` or
    `skipped`) or reports that the `type` tests have started running.
* `POST /v0/tests/:headSha/:type/report/:passed/:failed`
  * Updates the equivalent check with the number of `passed` and `failed` tests
  * If `failed` is 0, sets the check's conclusion to `success`, which turns the
    check green
  * If `failed` ≥ 1, sets the check's conclusion to `action_required`, which
    turns the check red. It also sets a URL to resolve the issue back to the web
    interface of this app, which can only be accessed by the weekly build cop or
    a fixed set of authorized users

### Web UI

The App provides a web interface for the weekly build cop. Login is performed
via GitHub authentication, and the interface can only be accessed by the weekly
build cop or a fixed set of authorized users. Other users will receive a 403
error page.

The interface has the following paths:

* `GET /:headSha/:type/status`
  * Displays the status of the check as reported from Travis, and provides a
    link to skip these test
* `GET /:headSha/:type/skip`
  * Displays the above, plus a form to add a reason for why they are skipping
    the tests
* `POST /:headSha/:type/skip`
  * Updates the equivalent check's conclusion to `success` with the provided
    explanation from the form, and redirects the build cop back to the pull
    request


Local development
-----------------

### Setup

Follow these setup instructions to start developing for this App locally:

1. Clone this repository and cd into the `test-status` directory
2. `npm install`
3. Run a local instance of PostgreSQL, or use the
   [Cloud SQL Proxy](https://cloud.google.com/sql/docs/postgres/sql-proxy)
   * While other database engines might work, we have only tested this on pg
4. Start a new [Smee channel](https://smee.io/). This can be used to proxy
   GitHub webhooks to your local machine
5. Create a new [GitHub App](https://github.com/settings/apps/new):
   * Give your app a name
   * Set the _Homepage_ and _Webhook URL_ fields to the Smee channel that you
     created above
   * Set the _User authorization callback URL_ to
     `http://localhost:3000/login/callback`
   * Set the _Webhook secret_ to a random, secure value
   * Give the App _Read & Write_ permissions on **Checks**, and _Read only_ on
     **Pull requests**
   * Subscribe to the **Pull request** events
   * None of the other fields are required
6. After creating the application, generate and download a private key. Also
   take note of the App ID, Client ID, and Client secret
7. Install the application on a GitHub repository that you want to use for
   testing. You might want to create a new repository for this purpose.
8. Copy the `.env.example` file to `.env` and modify the fields based on the
   instructions in that file and the values from the GitHub App page
   * The value for the `PRIVATE_KEY` field is a base64 representation of the
     `.pem` file you downloaded from the GitHub App page. On Linux/Mac you can
     convert that file by running `cat private-key-file.pem | base64` in a
     command line
9. Copy the `db-config.example.js` file to `db-config.js` and modify the fields
   based on the connection information to your database
10. `npm run dev`
   * This will reload the App on every file change. Quit the server with
     `<Ctrl> + C` or `<Cmd> + C`

If there are no errors after running the last command then the App is running
locally on your machine.

### Testing locally

Now, create a pull request on your testing repo (which should be caught by the
app via the GitHub webhook - see the console logs where you ran `npm run dev`).

Then, send `POST` requests the various API end-points. e.g., (where `[HEAD_SHA]`
is the head SHA of the branch that the pull request was created from):
* `POST http://localhost:3000/v0/tests/[HEAD_SHA]/unit/queued`
* `POST http://localhost:3000/v0/tests/[HEAD_SHA]/unit/started`
* `POST http://localhost:3000/v0/tests/[HEAD_SHA]/unit/report/50/0`
* `POST http://localhost:3000/v0/tests/[HEAD_SHA]/e2e/queued`
* `POST http://localhost:3000/v0/tests/[HEAD_SHA]/sauce-labs/queued`
* `POST http://localhost:3000/v0/tests/[HEAD_SHA]/sauce-labs/started`
* `POST http://localhost:3000/v0/tests/[HEAD_SHA]/sauce-labs/report/50/1`

Sending all of the above requests in sequence will create 3 checks on the pull
request: for `unit` tests with 50 passed tests and 0 failures (green check), for
`e2e` tests that are still "queued" to execute, and for `sauce-labs` tests with
50 passed tests and 1 failure (red check).

Finally, follow the `Resolve` link in the details page of the failed tests check
from above. This should redirect you to the web interface (passing through
GitHub's initial app authorization/login screen) where you can follow the form
to skip the test, turning it green.


Deployment
----------

This GitHub App is deployed on an AppEngine instance:
https://amp-test-status-bot.appspot.com/
