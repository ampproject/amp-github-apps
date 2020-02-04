#!/usr/bin/env bash

START_BOLD='\033[1m'
END_BOLD='\033[0m'
PROJECT_NAME=`gcloud info | grep -oP '(?<=project: \[)[-\w]+'`

echo -e Enter a secret to encrypt for gcloud project "$START_BOLD'$PROJECT_NAME'$END_BOLD":
read SECRET
echo
echo The encrypted base64-encoded secret is:
echo

ENCODED_SECRET=$(
  echo -n $SECRET | gcloud kms encrypt \
      --plaintext-file=- \
      --ciphertext-file=- \
      --location=global \
      --keyring=amp-github-apps-keyring \
      --key=app-env-key | base64)
echo -e "\033[1m$ENCODED_SECRET\033[0m"

echo
echo Add this to the 'secretEnv' section of the Cloud Build configuration.
