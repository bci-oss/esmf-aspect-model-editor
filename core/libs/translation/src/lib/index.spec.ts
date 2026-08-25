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

import {describe, expect, it} from 'vitest';
import * as translationLib from './index';
import {TranslocoHttpLoader} from './loaders/transloco-http.loader';
import {LanguageTranslationService} from './services/language-translation.service';

describe('translation lib public API', () => {
  it('should export TranslocoHttpLoader', () => {
    expect(translationLib.TranslocoHttpLoader).toBe(TranslocoHttpLoader);
  });

  it('should export LanguageTranslationService', () => {
    expect(translationLib.LanguageTranslationService).toBe(LanguageTranslationService);
  });
});
