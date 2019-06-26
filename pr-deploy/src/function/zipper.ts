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
 */

const unzip = require('unzip-stream');
const {Storage} = require('@google-cloud/storage');

const PROJECT_ID = 'amp-travis-build-storage';
const PROJECT_KEY_PATH = './src/function/sa-pr-deploy-key.json';
const SERVE_BUCKET = 'amp-test-website-1';
const BUILD_BUCKET = 'amp-travis-builds'

const unzipAndMove = function() {
  authenticate_();

  const storage = new Storage({PROJECT_ID});
  const serveBucket = storage.bucket(SERVE_BUCKET);
  const serveDir = 'site-d/';

  const buildFile = storage.bucket(BUILD_BUCKET).file('amp_build_59289.zip');
  
  buildFile.createReadStream().pipe(unzip.Parse())
    .on('entry', entry => {
      const servePath = serveDir + entry.path;
      const serveFile = serveBucket.file(servePath);

      entry.pipe(
        serveFile.createWriteStream()
          .on('error', error => {
            console.log(error);
          })
          .on('finish', () => {
            console.log('write stream finished');
          })
      );  
    })
    .on('finish', () => {
      console.log('read stream finished');
    });
};

function authenticate_() {
  process.env.GOOGLE_APPLICATION_CREDENTIALS = PROJECT_KEY_PATH;
}

unzipAndMove();

module.exports = {
  unzipAndMove,
}