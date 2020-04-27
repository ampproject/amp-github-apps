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

/** A standard logging interface. */
export interface ILogger {
  debug(message: string, ...extraInfo: any[]): void;
  warn(message: string, ...extraInfo: any[]): void;
  error(message: string, ...extraInfo: any[]): void;
  info(message: string, ...extraInfo: any[]): void;
}

/**
 * Information about a range of lines from a Git blame.
 * See https://developer.github.com/v4/object/blamerange/
 */
export interface BlameRange {
  path: string;
  startingLine: number;
  endingLine: number;

  author: string;
  committedDate: Date;
  prNumber: number;
  changedFiles: number;
}

/** A frame in a stacktrace. */
export interface StackFrame {
  rtv: string;
  path: string;
  line: number;
}

/** GraphQL query response structure. */
namespace GraphQL {
  interface User {
    login: string;
  }

  interface Commit {
    changedFiles: number;
    committedDate: string;
    messageHeadline: string;
    author: {
      name: string;
      user: null | User;
    };
  }

  interface Blame {
    ranges: Array<{
      commit: Commit;
      startingLine: number;
      endingLine: number;
    }>;
  }

  export interface QueryResponse {
    repository: {
      ref: null | {target: {blame: Blame}};
    };
  }
}
export type GraphQLResponse = GraphQL.QueryResponse;

/** Information about a Pantheon error report. */
export interface ErrorReport {
  errorId: string;
  firstSeen: Date;
  dailyOccurrences: number;
  stacktrace: string;
}

/**
 * Types used in Stackdriver API requests.
 * Note that other fields may be present, but only the ones relevant are
 * included in the definitions below.
 */
export namespace Stackdriver {
  interface SerializedTimedCount {
    count: string;
    startTime: string;
    endTime: string;
  }

  interface TimedCount {
    count: number;
    startTime: Date;
    endTime: Date;
  }

  interface ErrorEvent {
    message: string;
  }

  export interface ErrorGroup {
    name: string;
    groupId: string;
    trackingIssues?: Array<{
      url: string;
    }>;
  }

  export interface SerializedErrorGroupStats {
    group: ErrorGroup;
    count: string;
    timedCounts: Array<SerializedTimedCount>;
    firstSeenTime: string;
    representative: {
      message: string;
    };
  }

  export interface ErrorGroupStats {
    group: ErrorGroup;
    count: number;
    timedCounts: Array<TimedCount>;
    firstSeenTime: Date;
    representative: {
      message: string;
    };
  }
}
