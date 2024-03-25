/**
 * Copyright 2020 The AMP HTML Authors. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the 'License');
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an 'AS-IS' BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

declare module 'error-monitoring' {
  /** A standard logging interface. */
  export interface Logger {
    debug(message: string, ...extraInfo: unknown[]): void;
    warn(message: string, ...extraInfo: unknown[]): void;
    error(message: string, ...extraInfo: unknown[]): void;
    info(message: string, ...extraInfo: unknown[]): void;
  }

  /** Types of service groups (indexes to ServiceName enum). */
  export type ServiceGroupType =
    | 'PRODUCTION'
    | 'DEVELOPMENT'
    | 'EXPERIMENTS'
    | 'NIGHTLY';

  /** Service information to determine frequency scaling across diversions. */
  export interface ServiceGroup {
    // The percentage of traffic this diversion set sees.
    readonly diversionPercent: number;
    // The base throttling rate of error reporting for this group.
    readonly throttleRate: number;
  }

  /**
   * Information about a range of lines from a Git blame.
   * See https://developer.github.com/v4/object/blamerange/
   */
  export interface BlameRange {
    readonly path: string;
    readonly startingLine: number;
    readonly endingLine: number;

    readonly author: string;
    readonly committedDate: Date;
    readonly prNumber: number;
    readonly changedFiles: number;
  }

  /** A frame in a stacktrace. */
  export interface StackFrame {
    readonly rtv: string;
    readonly path: string;
    readonly line: number;
  }

  /** GraphQL query response structure. */
  namespace GraphQL {
    interface User {
      readonly login: string;
    }

    interface Commit {
      readonly changedFiles: number;
      readonly committedDate: string;
      readonly associatedPullRequests: {
        readonly nodes: {
          readonly number: number;
        }[];
      };
      readonly author: {
        readonly name: string;
        readonly user: User | null;
      };
    }

    interface Blame {
      readonly ranges: {
        readonly commit: Commit;
        readonly startingLine: number;
        readonly endingLine: number;
      }[];
    }

    export interface Ref {
      readonly target: {
        readonly blame: Blame;
      };
    }

    export interface QueryResponse {
      readonly repository: {
        readonly ref: Ref | null;
      };
    }
  }
  export type GraphQLResponse = GraphQL.QueryResponse;
  export type GraphQLRef = GraphQL.Ref;

  /** Information about a Pantheon error report. */
  export interface ErrorReport {
    readonly errorId: string;
    readonly firstSeen: Date;
    readonly dailyOccurrences: number;
    readonly stacktrace: string;
    readonly seenInVersions: string[];
  }

  /**
   * Types used in Stackdriver API requests.
   * Note that other fields may be present, but only the ones relevant are
   * included in the definitions below.
   */
  export namespace Stackdriver {
    interface SerializedTimedCount {
      readonly count: string;
      readonly startTime: string;
      readonly endTime: string;
    }

    interface TimedCount {
      readonly count: number;
      readonly startTime: Date;
      readonly endTime: Date;
    }

    interface ErrorEvent {
      readonly message: string;
    }

    export interface ErrorGroup {
      readonly name: string;
      readonly groupId: string;
      readonly trackingIssues?: {
        readonly url: string;
      }[];
    }

    export interface ServiceContext {
      readonly service: string;
      readonly version: string;
    }

    export interface SerializedErrorGroupStats {
      readonly group: ErrorGroup;
      readonly count: string;
      readonly timedCounts: SerializedTimedCount[];
      readonly firstSeenTime: string;
      readonly numAffectedServices: string;
      readonly affectedServices: ServiceContext[];
      readonly representative: {
        readonly message: string;
      };
    }

    export interface ErrorGroupStats {
      readonly group: ErrorGroup;
      readonly count: number;
      readonly timedCounts: TimedCount[];
      readonly firstSeenTime: Date;
      readonly numAffectedServices: number;
      readonly affectedServices: ServiceContext[];
      readonly representative: {
        readonly message: string;
      };
    }
  }

  namespace ErrorList {
    interface ErrorReportMeta {
      readonly createUrl: string;
      readonly message: string;
    }

    type ErrorReportWithMeta = ErrorReport & ErrorReportMeta;

    interface ErrorReportView extends ErrorReportMeta {
      readonly errorId: string;
      readonly firstSeen: string;
      readonly dailyOccurrences: string;
      readonly stacktrace: string;
      readonly seenInVersions: string[];
    }

    interface JsonResponse {
      readonly serviceType: string;
      readonly serviceTypeThreshold: number;
      readonly normalizedThreshold: number;
      readonly errorReports: ErrorReportWithMeta[];
    }

    interface ServiceTypeView {
      readonly name: string;
      readonly formattedName: string;
      readonly selected: boolean;
    }
    interface ViewData {
      readonly currentServiceType: ServiceTypeView;
      readonly serviceType: string;
      readonly serviceTypeList: ServiceTypeView[];
      readonly serviceTypeThreshold: number;
      readonly normalizedThreshold: number;
      readonly errorReports: ErrorReportView[];
    }
  }

  interface TopIssueView {
    readonly errorId: string;
    readonly title: string;
    readonly issueUrl: string;
    readonly issueNumber: number;
  }
}
