/**
 * Copyright 2020, the AMP HTML authors
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

const childProcess = require('child_process');

const MIN_LOOKUP_ITVL_MS = 5 * 60 * 1000; // 5 minutes

let travisIps = [];
let lastLookup = null;

/**
 * Query Travis to get the list of possible IPs.
 *
 * @return {Array<string>}
 */
function runTravisIpLookup() {
  return childProcess.execSync('dig +short nat.travisci.net | sort');
}

/**
 * Refresh the list of Travis IPs, unless it has been checked recently.
 */
function refreshTravisIps() {
  // Don't refresh if we've tried to refresh very recently.
  if (new Date() - new Date(lastLookup) < MIN_LOOKUP_ITVL_MS) {
    console.info('Travis IPs updated recently; skipping refresh');
    return;
  }

  try {
    travisIps = runTravisIpLookup()
      .toString('utf8')
      .split('\n');
    lastLookup = new Date();
    console.info(
      `Travis IPs successfully refreshed; found ${travisIps.length} IPs`
    );
  } catch (e) {
    console.error(`Failed to refresh Travis IP list:`, e);
  }
}

/**
 * Tests if an IP is from Travis, possible refreshing the list if unsure.
 *
 * @param {string} ip IP address to check.
 * @return {boolean}
 */
function isTravisIp(ip) {
  // Allow a known IP.
  if (travisIps.includes(ip)) return true;

  // Otherwise, try to refresh and check again.
  refreshTravisIps();
  return travisIps.includes(ip);
}

module.exports = {isTravisIp, refreshTravisIps, runTravisIpLookup};
