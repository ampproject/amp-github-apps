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
      new Release('2234567890123'), // (TODO(estherkim): promote to stable) stable
      new Release('3234567890123'), // (TODO(estherkim): promote to percent_*) percent_beta
      new Release('4234567890123'), // (TODO(estherkim): promote to opt_in_*) opt_in_beta
      new Release('5234567890123'), // opt_in_nightly
      new Release('6234567890123'), // percent_nightly
    ].map(async release => {
      return repositoryService.createRelease(release);
    }),
  );

  const releases = await repositoryService.getReleases();
  const promises = [];
  const startDate = new Date(Date.now());
  //TODO(ajwhatson):clarify with estherkim about what channel path of releases through nightly
  const channelsForBeta = [
    Channel.PERCENT_NIGHTLY,
    Channel.OPT_IN_NIGHTLY,
    Channel.OPT_IN_BETA,
    Channel.PERCENT_BETA,
    Channel.STABLE,
    Channel.LTS,
  ];
  for (let i = 0; i < releases.length; i++) {
    for (let j = 0; j < channelsForBeta.length - 1 - i; j++) {
      const newDate = new Date();
      newDate.setDate(startDate.getDate() + j + 1);
      const promotions = promoteRelease(
        releases[i],
        channelsForBeta[j],
        channelsForBeta[j + 1],
        newDate,
      );
      promises.push(repositoryService.savePromotions(promotions));
    }

    //TODO(ajwhatson):clarify with estherkim about what channel path of releases through nightly
    const channelsForExperimental = [
      Channel.PERCENT_NIGHTLY,
      Channel.OPT_IN_NIGHTLY,
      Channel.OPT_IN_EXPERIMENTAL,
      Channel.PERCENT_EXPERIMENTAL,
    ];

    for (let k = 0; k < channelsForExperimental.length - 1 - i; k++) {
      const newDate = new Date();
      newDate.setDate(startDate.getDate() + k + 1);
      const promotions = promoteRelease(
        releases[i],
        channelsForExperimental[k],
        channelsForExperimental[k + 1],
        newDate,
      );
      promises.push(repositoryService.savePromotions(promotions));
    }
  }

  await Promise.all(promises);
}
