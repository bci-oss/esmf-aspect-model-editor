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

import {provideZonelessChangeDetection} from '@angular/core';
import {TestBed} from '@angular/core/testing';
import {beforeEach, describe, expect, it} from 'vitest';
import {AiErrorStore} from './ai-error.store';

describe('AiErrorStore', () => {
  let store: AiErrorStore;

  beforeEach(() => {
    TestBed.configureTestingModule({providers: [provideZonelessChangeDetection()]});
    store = TestBed.inject(AiErrorStore);
  });

  it('reports and clears an error', () => {
    expect(store.error()).toBeNull();
    store.report({code: 'offline', message: 'down'});
    expect(store.error()).toEqual({code: 'offline', message: 'down'});
    store.clear();
    expect(store.error()).toBeNull();
  });
});
