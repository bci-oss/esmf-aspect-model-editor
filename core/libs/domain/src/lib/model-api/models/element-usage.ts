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

import type {UnreadableModelFile} from '../../facades/workspace.facade';

/** An element referring to the analyzed element. */
export interface ElementUsage {
  urn: string;
  namespace: string;
  version: string;
  fileName: string;
  path: string;
  readOnly: boolean;
  /** Whether the referring element is defined in another file than the analyzed element. */
  external: boolean;
}

export interface ElementUsageReport {
  urn: string;
  usages: ElementUsage[];
  /** Files that could not be checked; the element may be used there as well. */
  unreadable: UnreadableModelFile[];
}

/** Whether a local change of the element (e.g. its name) would break other files. */
export function isUsedExternally(report: ElementUsageReport): boolean {
  return report.usages.some(usage => usage.external) || report.unreadable.length > 0;
}
