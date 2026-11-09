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

import {ChangedFile} from './refactoring';

/** Workspace files that were changed outside of the editor, e.g. in VS Code. */
export interface WorkspaceFilesChange {
  created: ChangedFile[];
  modified: ChangedFile[];
  removed: ChangedFile[];
}

/**
 * An event of the workspace watcher of the backend.
 * `ready` is sent on every (re)connect; changes made while disconnected are not reported and require a full refresh.
 */
export type WorkspaceEvent = {type: 'ready'} | {type: 'files-changed'; change: WorkspaceFilesChange};
