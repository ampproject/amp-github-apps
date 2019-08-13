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

const request = require('request');

/**
 * Fetches the list of Travis API IP addresses from the Travis API.
 *
 * @return {string[]} the list of IP addresses
 */
async function fetchTravisIps() {
  return await new Promise((resolve, reject) => {
    request(
      'https://dnsjson.com/nat.travisci.net/A.json',
      {json: true},
      (err, res, body) => {
        if (err) {
          reject(err);
        }
        if (!body.success) {
          reject(body.message);
        }
        resolve(body.results.records);
      }
    );
  });
}

module.exports = {fetchTravisIps};
