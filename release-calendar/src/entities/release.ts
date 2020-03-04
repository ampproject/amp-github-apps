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

import {Entity, PrimaryColumn, Column} from 'typeorm';

export enum Channel {
  LTS = 'lts',
  STABLE = 'stable',
  BETAONE = 'betaOne',
  EXPERIMENTALONE = 'experimentalOne',
  BETAOPTIN = 'betaOptin',
  EXPERIMENTALOPTIN = 'experimentalOptin',
  NIGHTLY = 'nightly',
  ERROR = 'error',
}

@Entity()
export class Release {
  constructor(name: string, channel: Channel, isRollback: boolean, date: Date) {
    this.name = name;
    this.channel = channel;
    this.isRollback = isRollback;
    this.date = date;
  }

  @PrimaryColumn('varchar', {length: 13})
  name: string;

  @Column({
    type: 'enum',
    enum: Channel,
    default: Channel.ERROR,
  })
  channel: Channel;

  @Column()
  isRollback: boolean;

  @Column('timestamp')
  date: Date;

}
