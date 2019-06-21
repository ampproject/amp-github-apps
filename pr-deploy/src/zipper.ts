/**
 * Copyright 2019 The AMP HTML Authors. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS-IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
'use strict';

 /**
 * @fileoverview 
 * Google Cloud Function that takes the minified build and test fixtures from
 * the AMP Travis Build Storage bucket, unzips it and writes to a test website bucket
 * that serves the files publicly. Function is triggered when someone clicks 'deploy'
 * with the amp-pr-deploy GitHub app.
 * 
 * gsutil function setup command: 
 */

const {auth, Compute} = require('google-auth-library');



const SERVE_URL = 'gs://amp-test-website-1';

const BUILD_URL = 'gs://amp-travis-builds';
const BUILD_KEY_FILE = 'sa-travis-key.json';
const BUILD_PROJECT_ID = 'amp-travis-build-storage';

const SERVICE_ACCOUNT = 'sa-travis@amp-travis-build-storage.iam.gserviceaccount.com';

const zipAndMove = (data, context) => {

  // authenticate for amp-travis-builds
  // https://www.npmjs.com/package/google-auth-library#compute


  // get zip folder name from data

  // read zip folder, create stream

  // unzip folder

  // write to dest bucket

  // return 'success'
};

function authenticate_() {
  const client = new Compute({
    serviceAccountEmail: SERVICE_ACCOUNT
  });

  
}


/**
 * Decrypts key used by storage service account
 */
// function decryptTravisKey_() {
//   // -md sha256 is required due to encryption differences between
//   // openssl 1.1.1a, which was used to encrypt the key, and
//   // openssl 1.0.2g, which is used by Travis to decrypt.
//   execOrDie(
//     `openssl aes-256-cbc -md sha256 -k ${process.env.GCP_TOKEN} -in ` +
//       `build-system/sa-travis-key.json.enc -out ${BUILD_KEY_FILE} -d`
//   );
// }

module.exports = {
  zipAndMove,
}