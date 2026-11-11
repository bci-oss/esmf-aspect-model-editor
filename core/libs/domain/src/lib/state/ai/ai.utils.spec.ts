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
import {aiElementName, newAiId} from './ai.utils';

describe('ai utils', () => {
  it('derives the element name from the URN', () => {
    expect(aiElementName('urn:samm:org.example:1.0.0#speed')).toBe('speed');
    expect(aiElementName('speed')).toBe('speed');
  });

  it('creates unique ids', () => {
    expect(newAiId()).not.toBe(newAiId());
  });
});
