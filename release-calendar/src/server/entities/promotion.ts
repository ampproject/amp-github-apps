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
import {EntitySchema} from 'typeorm';

const PromotionEntity = new EntitySchema<Promotion>({
  name: 'promotion',
  columns: {
    id: {
      type: Number,
      primary: true,
      generated: 'increment',
    },
    channel: {
      type: 'enum',
      enum: Channel,
    },
    date: {
      type: 'timestamp',
    },
    releaseName: {
      type: String,
      length: 13,
    },
  },
  relations: {
    release: {
      type: 'many-to-one',
      target: 'release',
      joinColumn: {name: 'releaseName', referencedColumnName: 'name'},
      nullable: false,
    },
  },
});

export default PromotionEntity;
