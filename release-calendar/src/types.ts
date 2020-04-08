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

export enum Channel {
  LTS = 'lts',
  STABLE = 'stable',
  PERCENT_BETA = 'perc-beta',
  PERCENT_EXPERIMENTAL = 'perc-experimental',
  OPT_IN_BETA = 'opt-in-beta',
  OPT_IN_EXPERIMENTAL = 'opt-in-experimental',
  NIGHTLY = 'nightly',
  ROLLBACK = 'rollback',
  CREATED = 'created',
}

export class Release {
  constructor(name: string) {
    this.name = name;
  }

  name: string;
  promotions: Promotion[];
  cherrypicked?: Release;
}

export class Promotion {
  constructor(
    release: Release,
    fromChannel: Channel,
    toChannel: Channel,
    date?: Date,
  ) {
    this.release = release;
    this.fromChannel = fromChannel;
    this.toChannel = toChannel;
    this.date = date ? date : new Date(Date.now());
  }

  id: number;
  release: Release;
  fromChannel: Channel;
  toChannel: Channel;
  date: Date;
}

export interface ApiService {
  getRelease: (name: string) => Promise<Release>;
  getReleases: () => Promise<Release[]>;
}
