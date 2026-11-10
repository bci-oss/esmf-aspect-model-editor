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

import {AiError} from '@ame/domain';

export type AiErrorAction = 'openSetup' | 'retry' | 'login' | 'openSettings';

export interface AiErrorView {
  /** Transloco key of the friendly message. */
  messageKey: string;
  actions: AiErrorAction[];
  /** The message of the backend, shown as detail. */
  detail: string;
}

const ERROR_ACTIONS: Record<string, AiErrorAction[]> = {
  invalid_key: ['openSetup'],
  quota_exceeded: ['retry', 'openSetup'],
  offline: ['retry'],
  timeout: ['retry'],
  not_authenticated: ['login'],
  model_not_found: ['openSetup'],
  provider_error: ['retry', 'openSetup'],
  local_only: ['openSettings', 'openSetup'],
  read_only: [],
  attachment_unsupported: [],
  attachment_too_large: [],
  attachment_unreadable: [],
  attachment_empty: [],
};

/** The friendly message and the suggested actions for an error code; unknown codes are shown as provider errors. */
export function aiErrorView(error: AiError): AiErrorView {
  const known = Object.prototype.hasOwnProperty.call(ERROR_ACTIONS, error.code);
  const code = known ? error.code : 'provider_error';
  return {messageKey: `ai.errors.${code}`, actions: ERROR_ACTIONS[code], detail: error.message ?? ''};
}
