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
import {splitNamespaceKey} from './workspace.models';

describe('splitNamespaceKey', () => {
  it('splits at the last colon', () => {
    expect(splitNamespaceKey('org.example:1.0.0')).toEqual({namespace: 'org.example', version: '1.0.0'});
  });

  it('keeps a key without version', () => {
    expect(splitNamespaceKey('org.example')).toEqual({namespace: 'org.example', version: ''});
  });
});
