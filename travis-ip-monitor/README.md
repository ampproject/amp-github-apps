# AMP GitHub Apps - Travis IP Monitor

Multiple AMP GitHub apps in this repository receive webhooks from the Travis API, which can only be authenticated by the source IPs. These IPs change frequently, and cause breakages to apps with hard-coded IP lists. This app periodically polls the Travis API and records the current Travis IP addresses.

## To edit/deploy

1. Fork the [ampproject/amp-github-apps repository](https://github.com/ampproject/amp-github-apps) and checkout a new branch
2. Download and install the [Google Cloud SDK](https://cloud.google.com/sdk/docs/downloads-apt-get)
3. Create a [new App Engine project](https://pantheon.corp.google.com/projectcreate)
4. Initialize the project locally with `gcloud init`
5. Install node dependencies with `npm install`
6. Create a [Cloud Storage bucket](https://pantheon.corp.google.com/storage)
7. Download a [service account key](https://pantheon.corp.google.com/apis/credentials) with **Storge Admin** permissions
8. Copy `example.env` to `.env` and update the environment values
9. Deploy the app with `gcloud app deploy app.yaml`
10. Deploy the cron tasks with `gcloud app deploy cron.yaml`
11. Trigger the initial IP fetch once by visiting `/_cron/refresh_travis_ip_list`
12. Verify the IPs were fetched, stored, and retrieved by visiting `/travis_ip_list.json`

## To access from an app in this repo

1. In the app project directory, `npm install --save-prod ../travis-ip-monitor`
2. In the Travis IP Monitor project, download a [service account key](https://pantheon.corp.google.com/apis/credentials) with **Storge Reader** permissions
3. Add the Travis IP Monitor project ID, Cloud Storage bucket name, and service account key filepath to the app's `.env` environment 
4. In the GitHub app:
    ```
    const {getTravisIpList} = require('travis-ip-monitor/travis-ip-list.js');

    const ipList = getTravisIpList({
      projectId: process.env.TRAVIS_IP_PROJECT_ID,
      keyFilename: process.env.TRAVIS_IP_APPLICATION_CREDENTIALS,
      bucketName: process.env.TRAVIS_IP_CLOUD_STORAGE_BUCKET,    
    });

    const travisIps = ipList.fetch(); // ['127.0.0.1', ...]

    // Do things with travisIps
    ```