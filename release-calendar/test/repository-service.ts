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

import {Channel, Promotion, Release} from '../src/types';
import {Connection, Repository} from 'typeorm';
import PromotionEntity from '../src/server/entities/promotion';
import ReleaseEntity from '../src/server/entities/release';

export class RepositoryService {
  private releaseRepository: Repository<Release>;
  private promotionRepository: Repository<Promotion>;

  constructor(connection: Connection) {
    this.releaseRepository = connection.getRepository(ReleaseEntity);
    this.promotionRepository = connection.getRepository(PromotionEntity);
  }

  getRelease(name: string): Promise<Release> {
    return this.releaseRepository.findOne({
      where: {name},
      relations: ['promotions'],
    });
  }

  async getReleases(): Promise<Release[]> {
    return this.releaseRepository.find({relations: ['promotions']});
  }

  async createRelease(release: Release, date?: Date): Promise<Release> {
    const entity = await this.releaseRepository.save(release);
    const promotion = new Promotion(entity, Channel.CREATED, Channel.NIGHTLY, date);
    await this.savePromotion(promotion);
    return this.getRelease(entity.name);
  }

  savePromotion(promotion: Promotion): Promise<Promotion> {
    return this.promotionRepository.save(promotion);
  }

  savePromotions(promotions: Promotion[]): Promise<Promotion[]> {
    return this.promotionRepository.save(promotions);
  }
}
