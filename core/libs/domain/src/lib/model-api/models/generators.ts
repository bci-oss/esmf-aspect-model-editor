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

export type DiagramFormat = 'SVG' | 'PNG';

export type SqlDialect = 'POSTGRESQL' | 'DATABRICKS';

export interface JavaClassesOptions {
  /** The Java package of the classes; if empty, the backend derives it from the namespace of the Aspect. */
  packageName: string;
  /** Adds the static meta model classes (e.g. `MetaMovement`) for type-safe access to the model structure. */
  staticMetaModel: boolean;
  /** Annotates the classes for JSON (de-)serialization with Jackson. */
  jacksonAnnotations: boolean;
}
