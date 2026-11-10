/*
 * Copyright (c) 2026 Robert Bosch Manufacturing Solutions GmbH
 *
 * See the AUTHORS file(s) distributed with this work for
 * additional information regarding authorship.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 *
 * SPDX-License-Identifier: MPL-2.0
 */

import {AiSecretInfo} from '@ame/shared';

/** Stores the API keys of the AI providers outside the settings: in the OS keychain or, in the browser, the session. */
export abstract class AiSecretStorePort {
  abstract set(provider: string, secret: string): Promise<void>;
  abstract get(provider: string): Promise<string | null>;
  abstract delete(provider: string): Promise<void>;
  abstract info(provider: string): Promise<AiSecretInfo>;
}
