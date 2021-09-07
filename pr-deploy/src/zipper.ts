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

import fetch from 'node-fetch';
import gunzip from 'gunzip-maybe';
import mime from 'mime-types';
import tar from 'tar-stream';
import {Storage} from '@google-cloud/storage';

/**
 * Takes the minified build and test fixtures from the
 * AMP CI Build Storage bucket, decompresses and writes to
 * a test website bucket that serves the files publicly.
 */
export async function decompressAndMove(
  sha: string,
  externalId?: string
): Promise<string> {
  const storage = new Storage({projectId: process.env.PROJECT_ID});
  const serveBucket = storage.bucket(process.env.SERVE_BUCKET);
  const buildFileName = `amp_nomodule_${sha}`;

  const buildArtifactJsonUrl = process.env.BUILD_ARTIFACTS_URL.replace(
    '{externalId}',
    externalId
  );
  const buildArtifactZipUrl = await fetch(buildArtifactJsonUrl)
    .then(async res => res.json())
    .then((json: Array<{[key: string]: string}>) =>
      json.find(item => item['path'].endsWith('/amp_nomodule_build.tar.gz'))
    )
    .then(item => item['url']);

  return await new Promise(async (resolve, reject) => {
    const res = await fetch(buildArtifactZipUrl);
    res.body.pipe(gunzip()).pipe(
      tar
        .extract()
        .on('entry', (header, stream, next) => {
          if (header.type == 'directory') {
            stream.resume();
            return next();
          }
          const serveFileName = header.name;
          const serveFile = serveBucket.file(
            `${buildFileName}/${serveFileName}`
          );
          const contentType =
            mime.lookup(serveFileName) || 'application/octet-stream';
          stream.pipe(
            serveFile
              .createWriteStream({metadata: {contentType}})
              .on('error', reject)
          );
          stream.on('end', next);
        })
        .on('finish', () => {
          resolve(
            `https://console.cloud.google.com/storage/browser/${process.env.SERVE_BUCKET}/${buildFileName}`
          );
        })
    );
  });
}

module.exports = {
  decompressAndMove,
};
