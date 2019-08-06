/**
 * Copyright 2019, the AMP HTML authors
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
'use strict';

require('dotenv').config();
if (process.argv.length < 3) {
  console.error('No port specified; please run `node app.js <PORT>`');
}
const PORT = process.argv[2];
const CLOUD_STORAGE_BUCKET = process.env.CLOUD_STORAGE_BUCKET;

const express = require('express');
const {Storage} = require('@google-cloud/storage');
const {TravisIpList} = require('./travis-ip-list.js');
const {fetchTravisIps} = require('./travis-ip-lookup.js');

const app = express();
const storage = new Storage();
const bucket = storage.bucket(CLOUD_STORAGE_BUCKET);


app.get('/_cron/refresh_travis_ip_list', async (req, res) => {
  let travisIps = await fetchTravisIps(); 
  let ipList = new TravisIpList(bucket);
  await ipList.save(travisIps);
  res.send(`Refreshed IPs in Cloud Storage bucket ${CLOUD_STORAGE_BUCKET}!`);
});

app.get('/travis_ip_list.json', async (req, res) => {
  let ipList = new TravisIpList(bucket);
  let travisIps = await ipList.fetch();
  res.setHeader('Content-type', 'application/json');
  res.end(JSON.stringify(travisIps));
});

app.listen(PORT, () => console.log(`Travis IP Monitor running on port ${PORT}`))
