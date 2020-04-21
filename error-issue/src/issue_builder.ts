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
import {BlameRange, ErrorReport} from './types';

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
    {errorId, firstSeen, dailyOccurrences, stacktrace}: ErrorReport,
    private blames: Array<BlameRange>
  ) {
    const [message, ...stack] = stacktrace.split('\n');
    Object.assign(this, {errorId, firstSeen, dailyOccurrences, message, stack});
  }

  get title(): string {
    return `🚨 ${this.message}`;
  }

  get labels(): Array<string> {
    return ['Type: Error Report'];
  }

  get bodyDetails(): string {
    return [
      'Details',
      '---',
      `**Error report:** [link](go/ampe/${this.errorId})`,
      `**First seen:** ${formatDate(this.firstSeen)}`,
      `**Frequency:** ~ ${this.dailyOccurrences.toLocaleString('en-US')}/day`,
    ].join('\n');
  }

  get bodyStacktrace(): string {
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

  private blameMessage({
    path,
    startingLine,
    endingLine,
    author,
    committedDate,
    prNumber,
  }: BlameRange): string {
    return (
      `\`@${author}\` modified \`${path}:${startingLine}-${endingLine}\`` +
      ` in #${prNumber} (${formatDate(committedDate)})`
    );
  }

  possibleAssignees(): Array<string> {
    // TODO(rcebulko): Identify reasonable assignees for the issue.
    return [];
  }

  get bodyNotes(): string {
    const possibleAssignees = this.possibleAssignees()
      .map(a => `\`@${a}\``)
      .join(', ');
    const notes = ['Notes', '---']
      .concat(this.blames.map(blame => this.blameMessage(blame)))
      .join('\n');

    return possibleAssignees
      ? `${notes}\n\n**Possible assignees:** ${possibleAssignees}`
      : notes;
  }

  get body(): string {
    return [this.bodyDetails, this.bodyStacktrace, this.bodyNotes].join('\n\n');
  }
}
