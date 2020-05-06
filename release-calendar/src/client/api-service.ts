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

import {Channel, Promotion, Release} from '../types';
import {CurrentReleases, ReleaseEventInput} from './models/view-models';
import fetch from 'node-fetch';
const SERVER_ENDPOINT = `${process.env.SERVER_URL}:${process.env.SERVER_PORT}`;

export class ApiService {
  private getPromotionRequest(url: string): Promise<Promotion[]> {
    return fetch(url).then((result) => result.json());
  }

  private getReleaseRequest(url: string): Promise<Release> {
    return fetch(url).then((result) => result.json());
  }

  async getRelease(requestedRelease: string): Promise<ReleaseEventInput[]> {
    const release = await this.getReleaseRequest(
      `${SERVER_ENDPOINT}/releases/${requestedRelease}`,
    );
    return [
      new ReleaseEventInput(release.promotions[0], new Date()),
      ...release.promotions
        .slice(1)
        .map(
          (promotion, i) =>
            new ReleaseEventInput(promotion, release.promotions[i].date),
        ),
    ];
  }

  async getReleases(): Promise<ReleaseEventInput[]> {
    const allPromotions = await this.getPromotionRequest(
      `${SERVER_ENDPOINT}/releases/`,
    );
    const map = new Map<Channel, Date>();
    return allPromotions.map((promotion: Promotion) => {
      const date = map.get(promotion.channel) || new Date();
      map.set(promotion.channel, promotion.date);
      return new ReleaseEventInput(promotion, date);
    });
  }

  async getCurrentReleases(): Promise<CurrentReleases> {
    const currentReleases = await this.getPromotionRequest(
      `${SERVER_ENDPOINT}/current-releases/`,
    );
    return new CurrentReleases(currentReleases);
  }

  async getReleaseDates(requestedRelease: string): Promise<Release> {
    return await this.getReleaseRequest(
      `${SERVER_ENDPOINT}/releases/${requestedRelease}`,
    );
  }
}
