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
import {RepositoryService} from './repository-service';

function promoteRelease(
  release: Release,
  channel: Channel,
  startDate: Date,
): Promotion[] {
  const promotions = [];
  promotions.push(new Promotion(release, channel, startDate));
  return promotions;
}

export default async function addTestData(
  repositoryService: RepositoryService,
): Promise<void> {
  const releases = [
    new Release('2004252135000'), // lts
    new Release('2234567890123'), // stable
    new Release('3234567890123'), // beta
    new Release('5234567890123'), // nightly
  ];

  const today = new Date();
  const startDate = new Date(today.setDate(today.getDate() - 20));
  const promotePromises = [];
  const createPromises = [];
  const channels = [Channel.NIGHTLY, Channel.BETA, Channel.STABLE, Channel.LTS];

  for (let i = 0; i < releases.length; i++) {
    const newDate = new Date(startDate);
    newDate.setDate(startDate.getDate() + i * 5);
    createPromises.push(
      await repositoryService.createRelease(releases[i], newDate),
    );
    for (let j = 0; j < channels.length - 1 - i; j++) {
      const promoteDate = new Date(newDate);
      promoteDate.setDate(newDate.getDate() + j + 1);
      const promotions = promoteRelease(
        releases[i],
        channels[j + 1],
        promoteDate,
      );
      promotePromises.push(repositoryService.savePromotions(promotions));
    }
  }

  await Promise.all(createPromises);
  await Promise.all(promotePromises);
}
