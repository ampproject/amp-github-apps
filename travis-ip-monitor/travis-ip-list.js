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

const {CloudStorage} = require('./cloud-storage.js')
const TRAVIS_IP_FILENAME = process.env.TRAVIS_IP_FILENAME


class TravisIpList {
  constructor(bucket) {
    this.cloudStorage = new CloudStorage(bucket);
  }

  /**
   * Store the Travis IP list.
   *
   * @param ipList list of Travis API IP addresses.
   */
  async save(ipList) {
    const jsonString = JSON.stringify(ipList);
    await this.cloudStorage.upload(TRAVIS_IP_FILENAME, jsonString);
  }

  /**
   * Fetch the Travis IP list.
   *
   * @returns the list of Travis API IP addresses.
   */
  async fetch() {
    const jsonString = await this.cloudStorage.download(TRAVIS_IP_FILENAME);
    return JSON.parse(jsonString);
  }
}

module.exports = {TravisIpList}