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

import {ApiServiceInterface, Promotion} from '../types';
import {CurrentReleases, EventInput} from './models/view-models';
import fetch from 'node-fetch';
const SERVER_URL = `http://localhost:3000`;

export class ApiService implements ApiServiceInterface {
  private getPromotionRequest(url: string): Promise<Promotion[]> {
    return fetch(url).then((result) => result.json());
  }
  private getPromotionRequests(url: string): Promise<Promotion[][]> {
    return fetch(url).then((result) => result.json());
  }

  async getReleases(): Promise<EventInput[]> {
    const promotions = await this.getPromotionRequests(SERVER_URL);
    const collect: EventInput[] = [];
    promotions.forEach((promotionsInChannel: Promotion[]) => {
      const endDate: Date = new Date();
      collect.push(new EventInput(promotionsInChannel[0], endDate));
      for (let i = 1; i < promotionsInChannel.length; i++) {
        collect.push(
          new EventInput(
            promotionsInChannel[i],
            promotionsInChannel[i - 1].date,
          ),
        );
      }
    });
    return collect;
  }

  async getCurrentReleases(): Promise<CurrentReleases> {
    const currentReleases = await this.getPromotionRequest(
      SERVER_URL + '/current-releases/',
    );
    return new CurrentReleases(currentReleases);
  }
}
