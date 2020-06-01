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

import {StackFrame} from 'error-monitoring';

const SOURCE_PREFIX = 'https://raw.githubusercontent.com/ampproject/amphtml/';
const SOURCE_PATTERN = /^(?<rtv>\d+)\/(?<path>[^:]+):(?<line>\d+)(?<column>:\d+)?$/;

/** Formats a date for display in a GitHub issue. */
export function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/** Parses a PR number from a commit message, or 0 if none is found. */
export function parsePrNumber(message: string): number {
  const matches = message.match(/^.*\(#(?<prNumber>\d+)\)/);
  return matches ? parseInt(matches.groups.prNumber, 10) : 0;
}

/**
 * Parses the RTV, path, and line from a source URL:line string.
 * See https://github.com/ampproject/error-tracker/blob/master/utils/stacktrace/standardize-stack-trace.js
 */
export function parseSource(source: string): null | StackFrame {
  if (!source.startsWith(SOURCE_PREFIX)) {
    return null;
  }

  const matches = source.substr(SOURCE_PREFIX.length).match(SOURCE_PATTERN);
  if (!matches) {
    return null;
  }

  const {rtv, path, line} = matches.groups;
  return {rtv, path, line: parseInt(line, 10)};
}

/** Parses stack frames from a standardized stacktrace. */
export function parseStacktrace(stacktrace: string): Array<StackFrame> {
  return stacktrace
    .split('\n')
    .map(
      line =>
        line.match(/^\s*at .*\((?<source>.+)\)$/) ||
        line.match(/^\s*at (?<source>https:.+)$/)
    )
    .filter(Boolean)
    .map(({groups}) => parseSource(groups.source));
}

/** Creates links to GitHub view of source files in stacktrace. */
export function linkifySource(line: string): string {
  return line.replace(
    /https:\/\/[^\/]+\/(?<owner>[^\/]+)\/(?<repo>[^\/]+)\/(?<ref>[^\/]+)\/(?<path>[^:]+):(?<line>\d+)/,
    '<a href="https://github.com/$<owner>/$<repo>/blob/$<ref>/$<path>#L$<line>">$<path>:$<line></a>'
  );
}
