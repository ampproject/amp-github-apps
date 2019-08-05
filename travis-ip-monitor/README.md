# AMP GitHub Apps - Travis IP Monitor

Multiple AMP GitHub apps in this repository receive webhooks from the Travis API, which can only be authenticated by the source IPs. These IPs change frequently, and cause breakages to apps with hard-coded IP lists. This app periodically polls the Travis API and records the current Travis IP addresses.

## To edit/deploy:

1. Fork the ampproject/amp-github-apps repository and checkout a new branch
2. Download and install the [Google Cloud SDK](https://cloud.google.com/sdk/docs/downloads-apt-get)
3. Create a [new App Engine project](https://pantheon.corp.google.com/projectcreate)
4. Initialize the project locally with `gcloud init`
5. Install node dependencies with `npm install`