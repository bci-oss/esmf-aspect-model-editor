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

export interface AiContextIconOptions {
  /** `source`: the type of the source. */
  sourceType?: 'workspace' | 'github';
  /** `file`: the kind of the attachment or its file name. */
  fileKind?: string;
  fileName?: string;
}

/** The material icon of a file, model, namespace, source, element or error of the context. */
export function aiContextIcon(kind: string, options: AiContextIconOptions = {}): string {
  switch (kind) {
    case 'file':
      return options.fileKind === 'pdf' || options.fileName?.toLowerCase().endsWith('.pdf') ? 'picture_as_pdf' : 'attach_file';
    case 'model':
      return 'description';
    case 'namespace':
      return 'folder';
    case 'source':
      return options.sourceType === 'github' ? 'cloud' : 'inventory_2';
    case 'error':
      return 'error_outline';
    default:
      return 'category';
  }
}
