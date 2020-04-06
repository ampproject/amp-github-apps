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
  fromChannel: Channel,
  toChannel: Channel,
  startDate: Date,
): Promotion[] {
  const promotions = [];
  promotions.push(new Promotion(release, fromChannel, toChannel, startDate));
  return promotions;
}

export default async function addTestData(
  repositoryService: RepositoryService,
): Promise<void> {
  await Promise.all(
    [
      new Release('1234567890123'), // lts
      new Release('2234567890123'), // TODO(estherkim): promote to stable
      new Release('3234567890123'), // TODO(estherkim): promote to percent_*
      new Release('4234567890123'), // TODO(estherkim): promote to opt_in_*
      new Release('5234567890123'), // nightly
      new Release('6234567890123'),
    ].map(async (release) => {
      return repositoryService.createRelease(release);
    }),
  );

  const releases = await repositoryService.getReleases();
  const promises = [];
  const startDate = new Date(Date.now());
  const channelsForBeta = [
    Channel.NIGHTLY,
    Channel.OPT_IN_BETA,
    Channel.PERCENT_BETA,
    Channel.STABLE,
    Channel.LTS,
  ];

  for (let i = 0; i < channelsForBeta.length - 1; i++) {
    const newDate = new Date();
    newDate.setDate(startDate.getDate() + i + 1);
    const promotions = promoteRelease(
      releases[0],
      channelsForBeta[i],
      channelsForBeta[i + 1],
      newDate,
    );
    promises.push(repositoryService.savePromotions(promotions));
  }

  const channelsForExperimental = [
    Channel.NIGHTLY,
    Channel.OPT_IN_EXPERIMENTAL,
    Channel.PERCENT_EXPERIMENTAL,
  ];

  for (let i = 0; i < channelsForExperimental.length - 1; i++) {
    const newDate = new Date();
    newDate.setDate(startDate.getDate() + i + 1);
    const promotions = promoteRelease(
      releases[0],
      channelsForExperimental[i],
      channelsForExperimental[i + 1],
      newDate,
    );
    promises.push(repositoryService.savePromotions(promotions));
  }

  await Promise.all(promises);
}
