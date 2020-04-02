/**
 * Copyright 2020 The AMP HTML Authors. All Rights Reserved.
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

import {Release} from './models/view-models';
import {Release as ReleaseEntity} from '../types';
const SERVER_URL = `http://localhost:3000`;

export class ApiService implements ApiService {
  private getRequest(url: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('GET', url);

      xhr.onload = (): void => {
        if (xhr.status == 200) {
          resolve(xhr.response);
        } else {
          reject({
            status: xhr.status,
            statusText: xhr.statusText,
          });
        }
      };

      xhr.onerror = (): void => {
        reject({
          status: xhr.status,
          statusText: xhr.statusText,
        });
      };

      xhr.send();
    });
  }

  async getReleases(): Promise<Release[]> {
    const response = await this.getRequest(SERVER_URL);
    const releasesJson: ReleaseEntity[] = JSON.parse(response).items;
    const releases = releasesJson.map(release => {
      return new Release(release);
    });
    return Promise.resolve(releases);
  }
}
