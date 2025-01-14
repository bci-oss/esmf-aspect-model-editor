/*
 * Copyright (c) 2024 Robert Bosch Manufacturing Solutions GmbH
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

import {
  Aspect,
  Characteristic,
  DefaultAspect,
  DefaultCharacteristic,
  DefaultEntity,
  DefaultEntityInstance,
  DefaultEvent,
  DefaultProperty,
  DefaultUnit,
  Entity,
  NamedElement,
  Property,
} from '@esmf/aspect-model-loader';

export class CachedFile {
  private anonymousElements: {element: NamedElement; name: string}[] = [];
  private cachedElements: Map<string, any> = new Map<string, NamedElement>();
  private _aspect: Aspect;

  get aspect(): Aspect {
    return this._aspect;
  }

  set aspect(value: Aspect) {
    if (value instanceof DefaultAspect) {
      this._aspect = value;
    }
  }

  constructor(
    public fileName: string,
    public namespace: string,
  ) {}

  resolveElement<T extends NamedElement>(instance: T): T {
    const aspectModelUrn = instance.aspectModelUrn;
    const resolvedInstance: T = this.getElement(aspectModelUrn);
    if (resolvedInstance) {
      return resolvedInstance;
    }

    this.cachedElements.set(aspectModelUrn, instance);
    return instance;
  }

  removeElement(key: string): void {
    this.cachedElements.delete(key);
  }

  removeAspect() {
    this._aspect = null;
  }

  reset() {
    this.cachedElements = new Map<string, NamedElement>();
    this._aspect = null;
    this.anonymousElements = [];
  }

  getElement<T>(key: string): T {
    return this.cachedElements.get(key);
  }

  getEitherElement<T>(key: string): T {
    return this.cachedElements.get(key);
  }

  getAllElements<T extends NamedElement>(): Array<T> {
    return [...this.cachedElements.values()];
  }

  hasCachedElements(): boolean {
    return this.cachedElements.size > 0;
  }

  updateCachedElementKey(oldKey: string, newKey: string) {
    const resolvedEntry = this.cachedElements.get(oldKey);
    if (resolvedEntry) {
      this.cachedElements.delete(oldKey);
      this.cachedElements.set(newKey, resolvedEntry);
    }
  }

  getCachedEntities(): Array<Entity> {
    const entities: Array<Entity> = [];
    this.cachedElements.forEach(modelElement => {
      if (modelElement instanceof DefaultEntity) {
        entities.push(modelElement);
      }
    });
    return entities;
  }

  getCachedAbstractEntities(): Array<DefaultEntity> {
    const entities: Array<DefaultEntity> = [];
    this.cachedElements.forEach(modelElement => {
      if (modelElement instanceof DefaultEntity && modelElement.isAbstractEntity()) {
        entities.push(modelElement);
      }
    });
    return entities;
  }

  getCachedAbstractProperties(): Array<DefaultProperty> {
    const abstractProperties: Array<DefaultProperty> = [];
    this.cachedElements.forEach(modelElement => {
      if (modelElement instanceof DefaultProperty && modelElement.isAbstract) {
        abstractProperties.push(modelElement);
      }
    });
    return abstractProperties;
  }

  getCachedProperties(): Array<Property> {
    const properties: Array<Property> = [];
    this.cachedElements.forEach(modelElement => {
      if (modelElement instanceof DefaultProperty) {
        properties.push(modelElement);
      }
    });
    return properties;
  }

  getCachedEntityValues(): Array<DefaultEntityInstance> {
    return Array.from(this.cachedElements.values()).reduce(
      (acc: DefaultEntityInstance[], item: any) => (item instanceof DefaultEntityInstance ? [...acc, item] : acc),
      [],
    );
  }

  getCachedCharacteristics(): Array<Characteristic> {
    const characteristics: Array<Characteristic> = [];
    this.cachedElements.forEach(modelElement => {
      if (modelElement instanceof DefaultCharacteristic) {
        characteristics.push(modelElement);
      }
    });
    return characteristics;
  }

  getCachedUnits(): Array<DefaultUnit> {
    return Array.from(this.cachedElements.values()).reduce(
      (acc: DefaultUnit[], item: any) => (item instanceof DefaultUnit && !item.isPredefined ? [...acc, item] : acc),
      [],
    );
  }

  getCachedEvents(): Array<DefaultEvent> {
    return Array.from(this.cachedElements.values()).reduce(
      (acc: DefaultEvent[], item: any) => (item instanceof DefaultEvent && !item.isPredefined ? [...acc, item] : acc),
      [],
    );
  }

  updateCachedElementsNamespace(oldValue: string, newValue: string) {
    const newCachedElements = new Map<string, NamedElement>();

    this.cachedElements.forEach((element: NamedElement, key: string) => {
      const newAspectModelUrn = element.aspectModelUrn.replace(oldValue, newValue);
      const newKey = key.replace(oldValue, newValue);

      element.aspectModelUrn = newAspectModelUrn;
      newCachedElements.set(newKey, element);
    });
    this.cachedElements = newCachedElements;
    this.namespace = this.namespace.replace(oldValue, newValue);
  }

  addAnonymousElement(modelElement: NamedElement, name?: string) {
    this.anonymousElements.push({element: modelElement, name: name});
  }

  getAnonymousElements(): {element: NamedElement; name: string}[] {
    return [...this.anonymousElements];
  }

  clearAnonymousElements() {
    this.anonymousElements = [];
  }

  clearCache() {
    this.cachedElements.clear();
  }
}
