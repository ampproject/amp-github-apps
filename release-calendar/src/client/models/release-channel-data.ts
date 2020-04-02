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
import {Channel} from '../../types';

const DATAMAP = new Map<Channel, string>();
DATAMAP.set(Channel.LTS, '1111111111111');
DATAMAP.set(Channel.STABLE, '2222222222222');
DATAMAP.set(Channel.PERCENT_BETA, '333333333333');
DATAMAP.set(Channel.PERCENT_EXPERIMENTAL, '4444444444444');
DATAMAP.set(Channel.OPT_IN_BETA, '5555555555555');
DATAMAP.set(Channel.OPT_IN_EXPERIMENTAL, '6666666666666');
DATAMAP.set(Channel.NIGHTLY, '7777777777777');
export {DATAMAP};
