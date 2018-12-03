AMP Bundle-Size Bot
===================

This GitHub App performs checks on the size of the compiled AMP bundle, and
blocks pull requests from being merged without specific approval from the team
that maintains the bundle size.

The app runs on an instance of Google AppEngine and is installed exclusively for
the ampproject/amphtml repository.


Webhooks and API
----------------

The App subscribes to the following GitHub Webhooks:

* [`PullRequestEvent`](https://developer.github.com/v3/activity/events/types/#pullrequestevent)
  (`opened` and `synchronize` actions)
  * Start a new "pending" check on the head commit of the pull request
* [`PullRequestReviewEvent`](https://developer.github.com/v3/activity/events/types/#pullrequestreviewevent)
  (`submitted` action)
  * If the submitted review is an approval of the pull request, the approver is
    in the list of people that are allowed to approve bundle size increases, and
    the PR has increased the bundle size by more than the allowed amount, this
    Webhook will mark the above created check as approved

The App also has the following API points, which are to be triggered from the
Travis CI tests. If the `TRAVIS_IP_ADDRESSES` environment variable is set, only
requests from this comma separated list of IP addresses will be processed.

* `/v0/commit/:headSha/skip`
  * Marks the check on the supplied head commit as skipped, for when the pull
    request does not change the bundle at all (e.g., documentation changes)
* `/v0/commit/:headSha/report`
  * Accepts a JSON object with a numeric `bundleSize` field, denoting the size
    of the compiled bundle based on the head commit in KB
  * Calculated the change in the size of the compiled bundle between the base
    and the head commits, and determines whether to mark the check as passed
    (i.e., when the bundle size is not increased or is increased by a fraction),
    or whether to mark the check as requiring action (i.e., the size increases
    significantly or could not be calculated for any reason).



Local development
-----------------

Follow these setup instructions to start developing for this App locally:

1. Clone this repository and cd into the `bundle-size` directory
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
   * Set the _Webhook secret_ to a random, secure value
   * Give the App _Read & Write_ permissions on **Checks** and **Pull requests**
   * Subscribe to the **Pull request** and **Pull request review** events
   * None of the other fields are required
6. After creating the application, generate and download a private key. Also
   take note of the App ID
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

Create a pull request on your testing repo with another GitHub user or ask a
friend to create one for you. The same user that creates the pull request cannot
review it.


Deployment
----------

This GitHub App is deployed on an AppEngine instance:
https://amp-bundle-size-bot.appspot.com/
