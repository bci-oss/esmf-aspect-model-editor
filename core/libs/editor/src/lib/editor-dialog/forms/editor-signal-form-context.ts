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

import {computed, signal, WritableSignal} from '@angular/core';
import {FieldTree, form, SchemaOrSchemaFn} from '@angular/forms/signals';

export type EditorFormModel = Record<string, unknown>;

/**
 * Shared native Signal Forms context for the polymorphic editor dialog.
 *
 * Editor fields are registered dynamically because the available fields depend on the
 * selected SAMM element type and configured languages. The FieldTree remains stable while
 * updates are written to the model signal.
 */
export class EditorSignalFormContext<TModel extends EditorFormModel = EditorFormModel> {
  static create(): EditorSignalFormContext {
    return new EditorSignalFormContext<EditorFormModel>({changedMetaModel: null});
  }

  private readonly registeredFields = signal(new Map<string, FieldTree<unknown>>());

  readonly model: WritableSignal<TModel>;
  readonly fieldTree: FieldTree<TModel>;
  readonly valid = computed(() => this.fieldTree().valid() && [...this.registeredFields().values()].every(field => field().valid()));

  constructor(initialValue: TModel, schema?: SchemaOrSchemaFn<TModel>) {
    this.model = signal({...initialValue});
    this.fieldTree = schema ? form(this.model, schema) : form(this.model);
  }

  value(): TModel {
    const registeredValues = [...this.registeredFields()].reduce<EditorFormModel>((values, [key, field]) => {
      values[key] = field().value();
      return values;
    }, {});
    return {...this.model(), ...registeredValues};
  }

  field<TValue>(key: string): FieldTree<TValue> {
    const registeredField = this.registeredFields().get(key);
    if (registeredField) {
      return registeredField as unknown as FieldTree<TValue>;
    }
    return this.fieldTree[key] as unknown as FieldTree<TValue>;
  }

  register<TValue>(key: string, field: FieldTree<TValue>): () => void {
    this.registeredFields.update(fields => new Map(fields).set(key, field as FieldTree<unknown>));
    return () => this.remove(key);
  }

  set<TValue>(key: string, value: TValue): void {
    const field = this.registeredFields().get(key);
    if (field) {
      field().value.set(value);
      return;
    }
    this.model.update(model => ({...model, [key]: value}));
  }

  patch(value: Partial<TModel>): void {
    this.model.update(model => ({...model, ...value}));
  }

  remove(key: string): void {
    this.registeredFields.update(fields => {
      const updatedFields = new Map(fields);
      updatedFields.delete(key);
      return updatedFields;
    });
    this.model.update(model => {
      const updated = {...model};
      delete updated[key];
      return updated;
    });
  }

  reset(value: TModel): void {
    this.model.set({...value});
    this.fieldTree().reset();
  }
}
