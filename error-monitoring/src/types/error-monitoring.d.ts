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
    diversionPercent: number;
    // The base throttling rate of error reporting for this group.
    throttleRate: number;
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
      associatedPullRequests: {
        nodes: Array<{number: number}>;
      };
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

    export interface Ref {
      target: {blame: Blame};
    }

    export interface QueryResponse {
      repository: {ref: null | Ref};
    }
  }
  export type GraphQLResponse = GraphQL.QueryResponse;
  export type GraphQLRef = GraphQL.Ref;

  /** Information about a Pantheon error report. */
  export interface ErrorReport {
    errorId: string;
    firstSeen: Date;
    dailyOccurrences: number;
    stacktrace: string;
    seenInVersions: Array<string>;
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

    export interface ServiceContext {
      service: string;
      version: string;
    }

    export interface SerializedErrorGroupStats {
      group: ErrorGroup;
      count: string;
      timedCounts: Array<SerializedTimedCount>;
      firstSeenTime: string;
      numAffectedServices: string;
      affectedServices: Array<ServiceContext>;
      representative: {
        message: string;
      };
    }

    export interface ErrorGroupStats {
      group: ErrorGroup;
      count: number;
      timedCounts: Array<TimedCount>;
      firstSeenTime: Date;
      numAffectedServices: number;
      affectedServices: Array<ServiceContext>;
      representative: {
        message: string;
      };
    }
  }

  namespace ErrorList {
    interface ErrorReportMeta {
      createUrl: string;
      message: string;
    }

    type ErrorReportWithMeta = ErrorReport & ErrorReportMeta;

    interface ErrorReportView extends ErrorReportMeta {
      errorId: string;
      firstSeen: string;
      dailyOccurrences: string;
      stacktrace: string;
      seenInVersions: Array<string>;
    }

    interface JsonResponse {
      serviceType: string;
      serviceTypeThreshold: number;
      normalizedThreshold: number;
      errorReports: Array<ErrorReportWithMeta>;
    }

    interface ServiceTypeView {
      name: string;
      formattedName: string;
      selected: boolean;
    }
    interface ViewData {
      currentServiceType: ServiceTypeView;
      serviceType: string;
      serviceTypeList: Array<ServiceTypeView>;
      serviceTypeThreshold: number;
      normalizedThreshold: number;
      errorReports: Array<ErrorReportView>;
    }
  }

  interface TopIssueView {
    errorId: string;
    title: string;
    issueUrl: string;
    issueNumber: number;
  }
}
