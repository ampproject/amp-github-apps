#!/usr/bin/env bash

# Encrypts a `.env` file to `.env.enc`, which can be safely checked into the
# repository.
#
# Example usage:
#
# `bundle-size-chart> ../encrypt-env.sh bundle-size-chart`

die () {
  echo >&2 "$@"
  exit 1
}

# Require exactly one command-line argument
[ "$#" -eq 1 ] || die "1 argument (app name) required; $# provided"

KEYRING=amp-github-apps-keyring
APP_NAME=$1
APP_DIR=./$APP_NAME

gcloud kms encrypt \
  --plaintext-file=.env \
  --ciphertext-file=.env.enc \
  --location=global \
  --keyring=$KEYRING \
  --key="${APP_NAME}-env-key"
