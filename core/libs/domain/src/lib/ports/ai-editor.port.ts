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

import {Signal} from '@angular/core';
import {Observable} from 'rxjs';
import {AiChatContext} from '../model-api';

/** An element of the open model offered for `@` mentions. */
export interface AiModelElement {
  urn: string;
  name: string;
  /** SAMM type, e.g. `Property`. */
  type: string;
}

/** The model open in the editor. */
export interface AiOpenModel {
  /** Name shown in the context chip, e.g. the file name. */
  label: string;
  urn?: string;
  /** From a read-only (GitHub) source; it is never changed. */
  readOnly: boolean;
}

/** What the AI assistant needs from the editor. Implemented by the editor. */
export abstract class AiEditorPort {
  /** Context of the open model; empty when no model is open. */
  abstract currentContext(): Observable<AiChatContext>;
  /** The open model, or null. */
  abstract readonly openModel: Signal<AiOpenModel | null>;
  /** The element selected in the graph, or null. */
  abstract readonly selectedElementUrn: Signal<string | null>;
  /** The named elements of the open model. */
  abstract modelElements(): AiModelElement[];
  /** Replaces the open model by the Turtle; recorded in the history so it can be undone. Emits whether it was applied. */
  abstract applyModelChange(turtle: string): Observable<boolean>;
  /** Opens the Turtle as a new model and asks where to save it. Emits whether it was created. */
  abstract openNewModel(turtle: string): Observable<boolean>;
  /** Renames the element with the refactoring dialog and its preview. */
  abstract renameElement(urn: string, newName: string): void;
  /** Selects and shows the element in the graph. */
  abstract navigateToElement(urn: string): void;
}
