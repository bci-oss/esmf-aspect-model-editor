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

/** An Aspect Model the backend would create from an Asset Administration Shell file. */
export interface AasImportCandidate {
  urn: string;
  namespace: string;
  version: string;
  fileName: string;
  /** A file with this name exists already; the import is rejected then. */
  alreadyExists: boolean;
}

export const AAS_FILE_EXTENSIONS = ['aasx', 'xml', 'json'] as const;
