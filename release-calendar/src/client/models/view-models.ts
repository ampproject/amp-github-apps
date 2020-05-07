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

import {Channel, Promotion} from '../../types';
import {EventInput} from '@fullcalendar/core';

export class ReleaseEventInput implements EventInput {
  constructor(promotion: Promotion, endDate?: Date) {
    const calendarEnd = endDate ? new Date(endDate) : new Date();
    if (endDate) {
      calendarEnd.setDate(calendarEnd.getDate() - 1);
    }
    this.title = promotion.releaseName;
    this.start = promotion.date;
    this.end = calendarEnd;
    this.className = promotion.channel;
    this.extendedProps = {
      channel: promotion.channel,
      preciseEnd: endDate,
    };
  }

  get channel(): Channel {
    return this.extendedProps.channel;
  }

  get perciseEnd(): Date {
    return this.extendedProps.preciseEnd;
  }

  title: string;
  start: Date;
  end: Date;
  className: Channel;
  extendedProps: {channel: Channel; preciseEnd: Date};
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
