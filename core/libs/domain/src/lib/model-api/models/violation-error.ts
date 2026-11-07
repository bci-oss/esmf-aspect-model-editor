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

export interface ViolationError {
  message: string;
  focusNode: string;
  fix: string[];
  /** Automatic corrections the editor can apply to the loaded model. */
  quickFixes?: QuickFix[];
  errorCode?: string;
}

export interface QuickFixLiteral {
  value: string;
  /** The datatype URI, e.g. `http://www.w3.org/1999/02/22-rdf-syntax-ns#langString`. */
  datatype?: string;
  language?: string;
}

/** Replaces the value of a property of an element, e.g. adds the missing language tag of a preferred name. */
export interface QuickFix {
  description: string;
  /** The URN of the element to change. */
  element: string;
  /** The URI of the property to change. */
  property: string;
  oldValue: QuickFixLiteral;
  newValue: QuickFixLiteral;
}

export interface BackendValidationError {
  message: string;
  path?: string;
  code?: number;
  focusNode?: string | null;
}

export interface DetailViolationInfo {
  file: string;
  violationError: ViolationError[];
}
