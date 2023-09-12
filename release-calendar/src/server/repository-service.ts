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
import {Connection, Repository} from 'typeorm';
import PromotionEntity from './entities/promotion';
import ReleaseEntity from './entities/release';

export class RepositoryService {
  private releaseRepository: Repository<Release>;
  private promotionRepository: Repository<Promotion>;

  constructor(connection: Connection) {
    this.releaseRepository = connection.getRepository(ReleaseEntity);
    this.promotionRepository = connection.getRepository(PromotionEntity);
  }

  async getReleases(): Promise<Release[]> {
    return this.releaseRepository.createQueryBuilder('release').getMany();
  }

  async getRelease(name: string): Promise<Release> {
    const releaseQuery = this.releaseRepository
      .createQueryBuilder('release')
      .leftJoinAndSelect('release.promotions', 'promotion')
      .where('release.name = :name', {name})
      .orderBy('promotion.date', 'DESC')
      .getOne();

    return releaseQuery;
  }

  async getPromotions(): Promise<Promotion[]> {
    const channelQueries = this.promotionRepository
      .createQueryBuilder('promotion')
      .orderBy('promotion.date', 'DESC')
      .getMany();
    return channelQueries;
  }

  async getCurrentPromotions(): Promise<Promotion[]> {
    return Promise.all(
      [Channel.LTS, Channel.NIGHTLY, Channel.BETA, Channel.STABLE].map(
        async (channel) => {
          return this.promotionRepository
            .createQueryBuilder('promotion')
            .select('promotion.releaseName')
            .addSelect('promotion.channel')
            .where('promotion.channel = :channel', {channel})
            .orderBy('promotion.date', 'DESC')
            .getOne();
        },
      ),
    );
  }

  async createRelease(release: Release): Promise<void> {
    await this.releaseRepository.save(release).catch((error) => {
      // a throw is required here due to bug typeorm/typeorm#5057
      throw error;
    });
  }

  async createPromotion(promotion: Promotion): Promise<void> {
    await this.promotionRepository.save(promotion).catch((error) => {
      // a throw is required here due to bug typeorm/typeorm#5057
      throw error;
    });
  }
}
