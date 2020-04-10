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

import {Release, Promotion} from './models/view-models';
import {Release as ReleaseEntity, Promotion as PromotionEntity} from '../types';
import fetch from 'node-fetch';
const SERVER_URL = `http://localhost:3000`;

export class ApiService implements ApiService {
  private getReleaseRequest(url: string): Promise<ReleaseEntity[]> {
    return fetch(url).then((result) => result.json());
  }

  private getPromotionRequest(url: string): Promise<PromotionEntity[]> {
    return fetch(url).then((result) => result.json());
  }

  async getReleases(): Promise<Release[]> {
    const releases = await this.getReleaseRequest(SERVER_URL);
    return releases.map((release: ReleaseEntity) => {
      return new Release(release);
    });
  }

  async getPromotions(): Promise<Promotion[]> {
    const promotions = await this.getPromotionRequest(
      SERVER_URL + '/promotion/',
    );
    return promotions.map((promotion: PromotionEntity) => {
      return new Promotion(promotion);
    });
  }
}
