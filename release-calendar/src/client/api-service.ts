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
    const gridOfPromotions = await this.getPromotionRequests(SERVER_URL);
    const collect: EventInput[] = [];
    //each row is all the promotions that have occured in a single channel
    gridOfPromotions.forEach((rowOfPromotions: Promotion[]) => {
      collect.push(new EventInput(rowOfPromotions[0], new Date()));
      collect.push(
        ...rowOfPromotions
          .slice(1)
          .map(
            (promotion, i) =>
              new EventInput(promotion, rowOfPromotions[i].date),
          ),
      );
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
