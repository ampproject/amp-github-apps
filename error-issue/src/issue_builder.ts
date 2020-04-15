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

import {formatDate} from './utils';
import {ErrorReport} from './types';

/**
 * Builds a GitHub issue for a reported error.
 */
export class IssueBuilder {
  private errorId: string;
  private firstSeen: Date;
  private dailyOccurrences: number;
  private message: string;
  private stack: Array<string>;

  constructor(
    private repoOwner: string,
    private repoName: string,
    {errorId, firstSeen, dailyOccurrences, stacktrace}: ErrorReport,
  ) {
    const [message, ...stack] = stacktrace.split('\n');
    Object.assign(this, {errorId, firstSeen, dailyOccurrences, message, stack});
  }

  get title() {
    return `🚨 ${this.message}`;
  }

  get labels() {
    return ['Type: Error Report'];
  }

  get bodyDetails() {
    return [
      'Details',
      '---',
      `**Error report:** [link](go/ampe/${this.errorId})`,
      `**First seen:** ${formatDate(this.firstSeen)}`,
      `**Frequency:** ~ ${this.dailyOccurrences.toLocaleString('en-US')}/day`,
    ].join('\n');
  }

  get bodyStacktrace() {
    const indent = (line: string): string => line.replace(/^\s*/, '    ');
    return [
      'Stacktrace',
      '---',
      '```',
      this.message,
      ...this.stack.map(indent),
      '```',
    ].join('\n');
  }
}
