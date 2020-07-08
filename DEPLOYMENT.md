## To set up an auto-deploy project:

1. Create the actual App Engine project (or switch to an existing one) using `gcloud init`

2. Enable
    [_App Engine Admin_](https://pantheon.corp.google.com/apis/library/appengine.googleapis.com),
    [_Cloud Build_](https://console.developers.google.com/apis/library/cloudbuild.googleapis.com),
    and
    [_Cloud KMS_](https://console.developers.google.com/apis/library/cloudkms.googleapis.com)
    APIs

3. Create the [Cloud KMS keyring](https://cloud.google.com/cloud-build/docs/securing-builds/use-encrypted-secrets-credentials#example_build_request_using_an_encrypted_variable)
    - `gcloud kms keyrings create amp-github-apps-keyring --location=global`
    > Note: Because sharing a keyring across projects is complex, we use the same keyring name (`amp-github-apps-keyring`) for each project keyring; this uniformity makes it simpler to use shared encrypt/decrypt scripts. We will likewise use the standard `app-env-key` as the key name.

4. Provide team access to the keyring (use a real group name)
      ```
      gcloud kms keyrings add-iam-policy-binding amp-github-apps-keyring \
        --location=global \
        --member=group:infra-team-group@myorganization.com \
        --role=roles/cloudkms.cryptoKeyDecrypter
      ```
      > This will allow all members of the group to encrypt and decrypt secrets using this keyring.

5. Create the Cloud KMS CryptoKey
      ```
      gcloud kms keys create app-env-key \
        --location=global \
        --keyring=amp-github-apps-keyring \
        --purpose=encryption
      ```

6. Grant decryption permissions to the project service account
    ```
    gcloud kms keys add-iam-policy-binding app-env-key \
      --location=global \
      --keyring=amp-github-apps-keyring \
      --member=serviceAccount:[PROJECT_NUMBER]@cloudbuild.gserviceaccount.com \
      --role=roles/cloudkms.cryptoKeyDecrypter
    ```

7. Create the Cloud Build configuration file `cloud_build.yaml`
    > In the following bullets, "steps" refers to YAML build steps, not to instruction steps
    - Use an existing configuration as a template
    - The first two steps must be installing `yaml` and replacing secrets
    - The remaining steps will parallel the manual deployment process, such as `npm install`, `gcloud app deploy`, etc.
    > Note that the name provided to `replace-secrets`, as well as the `dir` property in the build steps, should be the name of the app directory (ex. `bundle-size`); the `kmsKeyName`, in contrast, will reference the Google Cloud project name (ex. `amp-bundle-size-bot`)

8. Grant App Engine access to Cloud Build service account on the [Service account permissions](https://console.cloud.google.com/cloud-build/settings) page
    - Set _App Engine Admin_ to _Enable_
    - If you need support for Cloud Build deploying Cron task updates:
      - Visit [IAM page](https://pantheon.corp.google.com/iam-admin/iam) and find the `@cloudbuild.gserviceaccount.com` service account
      - _Edit permissions_ > _Add Another Role_ > _Cloud Scheduler Admin_
    - If you need support for Cloud Build deploying Cloud Functions:
      Visit [IAM page](https://pantheon.corp.google.com/iam-admin/iam) and find the `@cloudbuild.gserviceaccount.com` service account
      - _Edit permissions_ > _Add Another Role_ > _Cloud Functions Developer_
      ```
      gcloud iam service-accounts add-iam-policy-binding \
        [PROJECT_ID]@appspot.gserviceaccount.com \
        --member \
        serviceAccount:[PROJECT_NUMBER]@cloudbuild.gserviceaccount.com \
        --role=roles/iam.serviceAccountUser
      ```
9. Create the [Cloud Build Trigger](https://pantheon.corp.google.com/cloud-build/triggers)
    - Click _Connect Repository_ and follow the steps to connect to `ampproject/amp-github-apps`; do not select _Create push trigger_ on the final step
    - Click _Create Trigger_, name the trigger "on-deploy-tag" or something similar, select `ampproject/amp-github-apps` as the _Source_, and set the _Event_ to _Push new tag_
    - For the tag pattern, use `deploy-{your-app-name}-\d{14}` (ex. `deploy-bundle-size-20200122154000` would be the deploy tag for the `bundle-size` app, with a timestamp of 15:40:00 on 2020-01-22). For consistency, deploy using the timestamp in the UTC timezone.
    - Under _Build Configuration_, select _Cloud Build configuration file_ and provide the path to your Cloud Build file, ex. `bundle-size/cloud_build.yaml`

10. Add the NPM script `deploy-tag`, which creates a git tag in the proper tag format for your app
    - Ex. ``git tag 'deploy-your-app-name-'`date --utc '+%Y%m%d%H%M%S'` ``

## To store an encrypted secret

1. Add the environment variable to `redacted.env`. Be sure to **redact the actual secret/token value**, as this file will be committed to the repository.
    > Note: We commit `redacted.env` with all non-sensitive environment variables and create `.env` on the GCloud Build instance at deployment. This is to prevent accidentally committing a secret token.
2. Encrypt and base64-encode the secret by running `bin/encrypt-secret.sh`
3. Add the environment variable name and the base64-encoded value from above to the `secrets.secretEnv` dict in `cloud_build.yaml`
4. Add the environment variable name to the `secretEnv` field of the `replace-secrets` step in `cloud_build.yaml`
    > Cloud Build will decode and decrypt the secrets listed here and provide them in the environment so `replace-scripts` can construct the un-redacted `.env` file.

## To deploy the app

1. Create a deploy tag: `npm run deploy-tag`
2. Push the newly created tag to trigger the deployment:
    `git push upstream deploy-{your-app-name}-{timestamp}`
    > Note: There is no alias to make this easier (you'll have to type out the new tag) in order to prevent accidentally deploying.
