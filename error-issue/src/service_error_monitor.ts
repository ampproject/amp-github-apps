/**
 * Copyright 2020 The AMP HTML Authors.
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

import {ErrorMonitor} from './error_monitor';
import {ServiceGroup, Stackdriver} from 'error-issue-bot';
import {StackdriverApi} from './stackdriver_api';

export enum ServiceName {
  PRODUCTION = 'CDN Production',
  DEVELOPMENT = 'CDN Development',
  EXPERIMENTS = 'CDN Experiments',
  NIGHTLY = 'CDN Nightly',
}

/**
 * Set of service groups to monitor and details for scaling frequency.
 * Note: These values do not need to be exact; the order-of-magnitude is what's
 * important here.
 */
const SERVICE_GROUPS: Record<ServiceName, ServiceGroup> = {
  'CDN Production': {diversionPercent: 0.98, throttleRate: 0.1},
  'CDN Development': {diversionPercent: 0.005, throttleRate: 1},
  'CDN Experiments': {diversionPercent: 0.005, throttleRate: 1},
  'CDN Nightly': {diversionPercent: 0.0005, throttleRate: 1},
};

/**
 * Returns the scaling factor to normalize frequency for a service group against
 * what it would be in production traffic.
 */
function scaleFactor(serviceName: ServiceName): number {
  const {
    diversionPercent: prodPercent,
    throttleRate: prodThrottle,
  } = SERVICE_GROUPS[ServiceName.PRODUCTION];
  const {diversionPercent, throttleRate} = SERVICE_GROUPS[serviceName];
  return (prodPercent * prodThrottle) / (diversionPercent * throttleRate);
}

export class ServiceErrorMonitor extends ErrorMonitor {
  // Note that minFrequency is relative to production traffic, and is scaled for
  // each diversion when thresholding.
  constructor(
    client: StackdriverApi,
    private serviceName: ServiceName,
    minFrequency = 5000,
    pageLimit = 25
  ) {
    super(client, minFrequency / scaleFactor(serviceName), pageLimit);
  }

  /** Finds top occurring errors in the service group. */
  protected async newErrors(): Promise<Array<Stackdriver.ErrorGroupStats>> {
    return this.client.listServiceGroups(this.serviceName, this.pageLimit);
  }
}
