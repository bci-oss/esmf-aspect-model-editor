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

import {InjectionToken, Type} from '@angular/core';

/** Inputs of the {@link AI_SETUP_COMPONENT}. */
export interface AiSetupInputs {
  /** `settings` embeds the setup in the settings without its title and "Done" button. */
  variant?: 'panel' | 'settings';
}

/**
 * The setup of the AI assistant (provider, sign-in or key, connection test). Provided by the AI feature so that
 * the settings can embed it without depending on the feature.
 */
export const AI_SETUP_COMPONENT = new InjectionToken<Type<unknown>>('AI_SETUP_COMPONENT');
