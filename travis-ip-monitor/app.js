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

let PORT = process.env.PORT;
if (!process.env.PORT) {
  if (process.argv.length < 3) {
    console.error('No port specified; please run `node app.js <PORT>`');
  }
  PORT = process.argv[2];
}

const {getTravisIpList} = require('./travis-ip-list.js');
const {fetchTravisIps} = require('./travis-ip-lookup.js');
const express = require('express');

const app = express();

const ipList = getTravisIpList(
  process.env.PROJECT_ID,
  process.env.GOOGLE_APPLICATION_CREDENTIALS,
  process.env.CLOUD_STORAGE_BUCKET
);

app.get('/_cron/refresh_travis_ip_list', async (req, res) => {
  const travisIps = await fetchTravisIps();
  await ipList.save(travisIps);
  res.send(`Refreshed IPs in bucket ${process.env.CLOUD_STORAGE_BUCKET}!`);
});

app.get('/travis_ip_list.json', async (req, res) => {
  let travisIps = [];

  try {
    travisIps = await ipList.fetch();
  } catch (e) {
    console.error(e);
  }

  res.setHeader('Content-type', 'application/json');
  res.end(JSON.stringify(travisIps));
});

app.listen(PORT, () => {
  console.log(`Travis IP Monitor running on port ${PORT}`);
});
