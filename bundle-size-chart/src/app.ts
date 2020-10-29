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

import {Octokit} from '@octokit/rest';
import {ReposListCommitsResponseData} from '@octokit/types';
import {Storage} from '@google-cloud/storage';
import {createObjectCsvStringifier} from 'csv-writer';
import dotenv from 'dotenv';
import express from 'express';
import process from 'process';

const CRON_TIMEOUT_MS = 600000; // 10 minutes, the GAE cron timeout limit.
const MAX_COMMIT_DAYS = 365;
const GCLOUD_STORAGE_BUCKET = 'amp-bundle-size-chart';

dotenv.config();

const app = express();
app.use(express.static('static'));

app.get('/_cron', async (request, response) => {
  response.setTimeout(CRON_TIMEOUT_MS);
  console.log('Running CRON job to save latest bundle sizes into a CSV file');

  // This header is set by App Engine when running cron tasks, and is
  // stripped out of external requests.
  if (!request.header('X-Appengine-Cron')) {
    return response
      .status(403)
      .end('Attempted external request to a cron endpoint');
  } else {
    response.status(201).end('Running cron task in the background');
  }

  const storage = new Storage();
  const bucket = storage.bucket(GCLOUD_STORAGE_BUCKET);
  console.log(
    `Initialized Google Cloud storage bucket ${GCLOUD_STORAGE_BUCKET}`
  );

  const earliestCommitDate = new Date();
  earliestCommitDate.setDate(earliestCommitDate.getDate() - MAX_COMMIT_DAYS);
  const earliestCommitDateString = earliestCommitDate.toISOString();
  console.log(`Finding bundle sizes until ${earliestCommitDateString}`);

  const github = new Octokit({
    auth: `token ${process.env.ACCESS_TOKEN}`,
  });

  const masterCommits: Array<{sha: string; message: string; date: string}> = [];
  const options = github.repos.listCommits.endpoint.merge({
    owner: 'ampproject',
    repo: 'amphtml',
    sha: 'master',
  });
  for await (const commitsList of github.paginate.iterator(options)) {
    (commitsList.data as ReposListCommitsResponseData).forEach(commit => {
      masterCommits.push({
        sha: commit.sha,
        message: commit.commit.message.split('\n')[0],
        date: commit.commit.committer.date,
      });
    });

    const latestCommit = masterCommits[masterCommits.length - 1];
    if (latestCommit.date < earliestCommitDateString) {
      console.log(`Retrieved ${masterCommits.length} commits.`);
      console.log(`First: ${masterCommits[0].sha}`);
      console.log(`Last: ${latestCommit.sha}`);
      break;
    }
  }

  console.log('Retrieving bundle size JSON files');
  const files = new Set<string>();
  const records: Array<{[key: string]: string | number}> = [];
  const skippedShas: Array<string> = [];
  for (const masterCommit of masterCommits) {
    try {
      const contents = await github.repos.getContent({
        owner: 'ampproject',
        repo: 'amphtml-build-artifacts',
        path: `bundle-size/${masterCommit.sha}.json`,
      });
      const bundleSizes = JSON.parse(
        Buffer.from(contents.data.content, 'base64').toString()
      );

      records.push(Object.assign({}, masterCommit, bundleSizes));
      Object.keys(bundleSizes).forEach(file => {
        files.add(file);
      });
    } catch (e) {
      skippedShas.push(masterCommit.sha);
      continue;
    }
  }
  console.warn(
    `Skipped unretrievable JSON files for commit SHAs: ${skippedShas}`
  );

  const header = Array.from(files)
    .sort()
    .map(file => ({id: file, title: file}));
  header.unshift(
    {id: 'sha', title: 'sha'},
    {id: 'message', title: 'message'},
    {id: 'date', title: 'date'}
  );

  console.log(`CSV headers: ${JSON.stringify(header)}`);
  console.log(`CSV first 3 rows: ${JSON.stringify(records.slice(0, 3))}`);
  const csvWriter = createObjectCsvStringifier({header});

  try {
    console.log('Storing bundle-sizes.csv file in Google Cloud bucket...');
    await bucket
      .file('bundle-sizes.csv')
      .save(csvWriter.getHeaderString() + csvWriter.stringifyRecords(records), {
        resumable: false,
      });
    console.log('Done!');
  } catch (e) {
    console.error(e);
  }
});

app.listen(Number(process.env.PORT || 8080));
