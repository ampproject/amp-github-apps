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

import {GitHub} from '../src/github';
import {Logger, RotationTeamMap, RotationUpdate} from 'onduty';
import {OndutyBot} from '../src/bot';

jest.mock('../src/github');
const mockGithub = GitHub.prototype as jest.Mocked<GitHub>;

describe('OndutyBot', () => {
  const fakeConsole: Logger = {
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
  };

  let bot: OndutyBot;
  const rotationTeams: RotationTeamMap = {
    'build-on-duty': 'build-team',
    'release-on-duty': 'release-team',
  };
  const rotations: RotationUpdate = {
    'build-on-duty': {
      primary: 'builder-primary',
      secondary: 'builder-secondary',
    },
    'release-on-duty': {
      primary: 'releaser-primary',
      secondary: 'releaser-secondary',
    },
  };

  beforeEach(() => {
    bot = new OndutyBot(mockGithub, rotationTeams, fakeConsole);
  });

  describe('updateRotation', () => {
    beforeEach(() => {
      mockGithub.getTeamMembers.mockResolvedValue([
        'builder-old-primary',
        'builder-primary',
      ]);
    });

    it('fetches current team members', async () => {
      await bot.updateRotation('build-on-duty', rotations['build-on-duty']);
      expect(mockGithub.getTeamMembers).toHaveBeenCalledWith('build-team');
    });

    it('adds new team members', async () => {
      await bot.updateRotation('build-on-duty', rotations['build-on-duty']);
      expect(mockGithub.addToTeam).toHaveBeenCalledWith(
        'build-team',
        'builder-secondary'
      );
    });

    it('removes old team members', async () => {
      await bot.updateRotation('build-on-duty', rotations['build-on-duty']);
      expect(mockGithub.removeFromTeam).toHaveBeenCalledWith(
        'build-team',
        'builder-old-primary'
      );
    });

    it('ignores the bot user', async () => {
      await bot.updateRotation('build-on-duty', rotations['build-on-duty']);
      expect(mockGithub.removeFromTeam).not.toHaveBeenCalledWith(
        'build-team',
        'bot-user'
      );
    });
  });

  describe('handleUpdates', () => {
    beforeEach(() => {
      mockGithub.getTeamMembers
        .mockResolvedValueOnce(['builder-old-primary', 'builder-primary'])
        .mockResolvedValueOnce(['releaser-old-primary', 'releaser-primary']);
    });

    it('updates each rotation', async () => {
      jest.spyOn(bot, 'updateRotation');
      await bot.handleUpdate(rotations);

      expect(bot.updateRotation).toHaveBeenCalledWith('build-on-duty', {
        primary: 'builder-primary',
        secondary: 'builder-secondary',
      });
      expect(bot.updateRotation).toHaveBeenCalledWith('release-on-duty', {
        primary: 'releaser-primary',
        secondary: 'releaser-secondary',
      });
    });
  });
});
