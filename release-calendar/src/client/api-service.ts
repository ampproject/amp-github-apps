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

export class ApiService {
  private getPromotionsRequest(url: string): Promise<Promotion[]> {
    return fetch(url).then((result) => result.json());
  }

  private getReleaseRequest(url: string): Promise<Release> {
    return fetch(url).then((result) => result.json());
  }
  private getReleasesRequest(url: string): Promise<Release[]> {
    return fetch(url).then((result) => result.json());
  }

  async getSinglePromotions(requestedRelease: string): Promise<Promotion[]> {
    const release = await this.getReleaseRequest(
      `releases/${requestedRelease}`,
    );
    return release.promotions;
  }

  async getReleases(): Promise<string[]> {
    const releases = await this.getReleasesRequest(`releases/`);
    return releases.map((release) => {
      return release.name;
    });
  }

  async getPromotions(): Promise<ReleaseEventInput[]> {
    const allPromotions = await this.getPromotionsRequest(`promotions/`);
    const map = new Map<Channel, Date>();
    return allPromotions.map((promotion: Promotion) => {
      const date = map.get(promotion.channel);
      map.set(promotion.channel, promotion.date);
      return new ReleaseEventInput(promotion, date);
    });
  }

  async getCurrentPromotions(): Promise<CurrentReleases> {
    const currentReleases = await this.getPromotionsRequest(
      `current-promotions`,
    );
    return new CurrentReleases(currentReleases);
  }

  async getRelease(requestedRelease: string): Promise<Release> {
    return await this.getReleaseRequest(`releases/${requestedRelease}`);
  }
}
