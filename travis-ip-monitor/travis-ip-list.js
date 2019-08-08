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
const {Storage} = require('@google-cloud/storage');
const TRAVIS_IP_FILENAME = 'travis_ips.json'


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

/**
 * Creates a TravisIpList object referencing the Travis IP Monitor app.
 * 
 * @param projectId the Travis IP Monitor app ID.
 * @param keyFilename file path to GAE service account key JSON file.
 * @param bucketName name of the Cloud Storage bucket holding the IP list.
 * @returns a TravisIpList reading from the app storage bucket.
 */
function getTravisIpList(projectId, keyFilename, bucketName) {
  const storage = new Storage({projectId, keyFilename});
  const bucket = storage.bucket(bucketName);
  return new TravisIpList(bucket);
}


module.exports = {TravisIpList, getTravisIpList}