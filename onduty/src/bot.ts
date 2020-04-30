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

import {GitHub} from './github';
import {
  Logger,
  Rotation,
  RotationTeamMap,
  RotationType,
  RotationUpdate,
} from 'onduty';
import sleep from 'sleep-promise';

const API_RATE_LIMIT_MS = Number(process.env.API_RATE_LIMIT_MS) || 250;

export class OndutyBot {
  constructor(
    private github: GitHub,
    private rotationTeams: RotationTeamMap,
    private logger: Logger = console
  ) {}

  async updateRotation(type: RotationType, rotation: Rotation): Promise<void> {
    const teamName = this.rotationTeams[type];
    this.logger.info(`[updateRotation] Updating ${type} rotation`);

    const members = await this.github.getTeamMembers(teamName);
    const currentRotation = Object.values(rotation)
      .filter(Boolean)
      .map(user => user.toLowerCase());
    const newMembers = currentRotation.filter(user => !members.includes(user));
    const oldMembers = members.filter(user => !currentRotation.includes(user));

    for (const newMember of newMembers) {
      await this.github.addToTeam(teamName, newMember);
      await sleep(API_RATE_LIMIT_MS);
    }
    for (const oldMember of oldMembers) {
      await this.github.removeFromTeam(teamName, oldMember);
      await sleep(API_RATE_LIMIT_MS);
    }
  }

  async handleUpdate(update: RotationUpdate): Promise<void> {
    for (const [type, rotation] of Object.entries(update)) {
      await this.updateRotation(type as RotationType, rotation);
    }
  }
}
