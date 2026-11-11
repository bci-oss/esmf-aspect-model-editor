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

/** A unique id, e.g. of a request or a chip of the context. */
export function newAiId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

/** The local name of an element, e.g. `speed` of `urn:samm:org.example:1.0.0#speed`. */
export function aiElementName(urn: string): string {
  const index = urn.lastIndexOf('#');
  return index >= 0 ? urn.slice(index + 1) : urn;
}
