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

import {Observable} from 'rxjs';
import {WorkspaceEvent} from '../model-api';

/** Live events about the workspace files from the backend. Implemented by infrastructure. */
export abstract class WorkspaceEventsPort {
  /** Connects on subscribe, reconnects on failures and disconnects on unsubscribe; it never completes. */
  abstract events(): Observable<WorkspaceEvent>;
}
