AMP Bundle-Size Chart
=====================

This ExpressJS App generates and displays a chart of the bundle sizes history of
compiled AMP files. It is deployed at https://amp-bundle-size-chart.appspot.com/

Unlike the other apps in this repository, this one was cobbled together quickly.
If you would like to improve the code or documentation, please send us a pull
requests!

Deployment
----------

Required tools:
* [`npm`](https://www.npmjs.com/) version 12 or up
* [`gcloud`](https://cloud.google.com/sdk/gcloud/) with
  [`gsutil`](https://cloud.google.com/storage/docs/gsutil)

Steps:
1. Clone this repository and cd into the `bundle-size-chart` directory
2. Run `npm install`
3. Create a user-based GitHub token with `public_repo` permissions.
4. Create a file called `.env` with one line:
   ```
   ACCESS_TOKEN=[[GITHUB_ACCESS_TOKEN]]
   ```
   (where `[[GITHUB_ACCESS_TOKEN]]` is the token generated in the previous step,
   without the square brackets.)
5. Create a Google AppEngine flexible NodeJS instance with a Google Cloud
   Storage bucket
   * When asked, set a uniform (no per-object ACL) access control on the storage
     bucket
   * Add a `Storage Object Viewer` permission to `allUsers` on the storage
     bucket
6. Set the CORS permissions on the bucket to allow connections from your GAE
   instance. Edit the `cors-json-file.json` file to add your GAE instance's
   `.appspot.com` domain and run:
   ```
   gsutil cors set cors-json-file.json gs://[[CLOUD_STORAGE_BUCKET_NAME]]
   ```
7. Run `npm run deploy` and `npm run deploy-cron` to deploy the app and cron job
