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

declare module 'onduty' {
  /** A standard logging interface. */
  export interface Logger {
    debug(message: string, ...extraInfo: unknown[]): void;
    warn(message: string, ...extraInfo: unknown[]): void;
    error(message: string, ...extraInfo: unknown[]): void;
    info(message: string, ...extraInfo: unknown[]): void;
  }

  export interface Rotation {
    primary: string;
    secondary: null | string;
  }

  export type RotationType = 'build-cop' | 'release-on-duty';
  export type RotationUpdate = Record<RotationType, Rotation>;
  export type RotationTeamMap = Record<RotationType, string>;

  export interface RotationReporterPayload extends RotationUpdate {
    accessToken: string;
  }
}
