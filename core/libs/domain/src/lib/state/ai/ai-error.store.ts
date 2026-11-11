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

import {Injectable, signal} from '@angular/core';
import {AiError} from '../../model-api';

/** The last error of the assistant outside of an answer, e.g. when conversations cannot be loaded; shown in the panel. */
@Injectable({providedIn: 'root'})
export class AiErrorStore {
  private readonly current = signal<AiError | null>(null);

  readonly error = this.current.asReadonly();

  report(error: AiError): void {
    this.current.set(error);
  }

  clear(): void {
    this.current.set(null);
  }
}
