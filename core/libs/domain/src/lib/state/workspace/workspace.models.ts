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

export interface WorkspaceFileItem {
  id: string; // namespace:fileName
  name: string;
  namespace: string;
  aspectModelUrn: string;
  loaded: boolean;
  outdated: boolean;
  errored: boolean;
  isLoadedInWorkspace: boolean;
  sammVersion?: string;
  dependencies?: string[];
  missingDependencies?: string[];
}

export interface WorkspaceSelection {
  namespace: string;
  file: string;
  aspectModelUrn: string;
}

/** Splits a workspace namespace key `org.example:1.0.0` into namespace and version. */
export function splitNamespaceKey(namespaceKey: string): {namespace: string; version: string} {
  const index = namespaceKey.lastIndexOf(':');
  return index < 0
    ? {namespace: namespaceKey, version: ''}
    : {namespace: namespaceKey.substring(0, index), version: namespaceKey.substring(index + 1)};
}
