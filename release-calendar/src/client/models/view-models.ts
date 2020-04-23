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

import {Channel, Promotion, Release as ReleaseEntity} from '../../types';

export class EventInput {
  constructor(release: ReleaseEntity, promotion: Promotion) {
    this.title = release.name;
    this.start = promotion.date;
    this.className = promotion.channel;
    this.extendedProps = {
      isRollback: promotion.channel == Channel.ROLLBACK,
      channel: promotion.channel,
    };
  }

  get rollback(): boolean {
    return this.extendedProps.isRollback;
  }

  get channel(): Channel {
    return this.extendedProps.channel;
  }

  title: string;
  start: Date;
  className: Channel;
  extendedProps: {isRollback: boolean; channel: Channel};
}

export class CurrentReleases {
  constructor(promotions: Promotion[]) {
    this.map = new Map<Channel, string>();
    promotions.forEach((promotion) => {
      this.map.set(promotion.channel, promotion.releaseName);
    });
  }

  map: Map<Channel, string>;
}
