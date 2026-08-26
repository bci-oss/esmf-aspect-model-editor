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

import {FormArray, FormControl, FormGroup} from '@angular/forms';
import {
  DefaultCharacteristic,
  DefaultEntity,
  DefaultEntityInstance,
  DefaultProperty,
  DefaultScalar,
  ModelElementCache,
} from '@esmf/aspect-model-loader';
import {describe, expect, it} from 'vitest';
import {EntityInstanceUtil} from './EntityInstanceUtil';

describe('EntityInstanceUtil', () => {
  it('getDisplayControl should create FormArray if not present', () => {
    const form = new FormGroup({});
    const control = EntityInstanceUtil.getDisplayControl(form, 'items');

    expect(control).toBeInstanceOf(FormArray);
    expect(form.get('items')).toBe(control);
  });

  it('getDisplayControl should return existing FormArray', () => {
    const existingArray = new FormArray([new FormControl('val')]);
    const form = new FormGroup({items: existingArray});
    const control = EntityInstanceUtil.getDisplayControl(form, 'items');

    expect(control).toBe(existingArray);
  });

  it('isDefaultPropertyWithLangString should identify language string scalar', () => {
    const langScalar = new DefaultScalar({
      urn: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#langString',
      metaModelVersion: '2.0.0',
    });
    const char = new DefaultCharacteristic({
      aspectModelUrn: 'urn:test#Char',
      name: 'Char',
      dataType: langScalar,
      metaModelVersion: '2.0.0',
    });
    const prop = new DefaultProperty({
      aspectModelUrn: 'urn:test#Prop',
      name: 'Prop',
      characteristic: char,
      metaModelVersion: '2.0.0',
    });

    expect(EntityInstanceUtil.isDefaultPropertyWithLangString(prop)).toBe(true);
  });

  it('showCreateNewEntityOption should check validity and availability', () => {
    const cache = new ModelElementCache();
    const entity = new DefaultEntity({
      aspectModelUrn: 'urn:test:1.0.0#Vehicle',
      name: 'Vehicle',
      metaModelVersion: '2.0.0',
    });
    const form = new FormGroup({name: new FormControl('Vehicle')});

    expect(EntityInstanceUtil.showCreateNewEntityOption('Car', [], cache, form, entity)).toBe(true);
    // Invalid if already in entityValues
    const instance = new DefaultEntityInstance({
      aspectModelUrn: 'urn:test:1.0.0#Car',
      name: 'Car',
      metaModelVersion: '2.0.0',
      type: entity,
    });
    expect(EntityInstanceUtil.showCreateNewEntityOption('Car', [instance], cache, form, entity)).toBe(false);
  });

  it('unlockValue should enable and clear the specified control', () => {
    const form = new FormGroup({
      props: new FormArray([new FormGroup({value: new FormControl({value: 'oldValue', disabled: true})})]),
    });

    EntityInstanceUtil.unlockValue(form, 'props', 0, 'value');

    const control = (form.get('props') as FormArray).at(0).get('value');
    expect(control.enabled).toBe(true);
    expect(control.value).toBe('');
  });

  it('changeSelection should update value and disable control', () => {
    const form = new FormGroup({
      props: new FormArray([new FormGroup({value: new FormControl('')})]),
    });
    const entity = new DefaultEntity({aspectModelUrn: 'urn:test#Car', name: 'Car', metaModelVersion: '2.0.0'});
    const instance = new DefaultEntityInstance({
      aspectModelUrn: 'urn:test#CarInstance',
      name: 'CarInstance',
      metaModelVersion: '2.0.0',
      type: entity,
    });

    EntityInstanceUtil.changeSelection(form, 'props', instance);

    expect(form.get('props').disabled).toBe(true);
    expect((form.get('props') as FormArray).at(0).get('value').value).toBe('CarInstance');
  });

  it('createNewEntityValue should instantiate DefaultEntityInstance and set on form', () => {
    const entity = new DefaultEntity({aspectModelUrn: 'urn:test:1.0.0#Car', name: 'Car', metaModelVersion: '2.0.0'});
    const char = new DefaultCharacteristic({
      aspectModelUrn: 'urn:test:1.0.0#CarChar',
      name: 'CarChar',
      dataType: entity,
      metaModelVersion: '2.0.0',
    });
    const prop = new DefaultProperty({
      aspectModelUrn: 'urn:test:1.0.0#carProp',
      name: 'carProp',
      characteristic: char,
      metaModelVersion: '2.0.0',
    });

    const form = new FormGroup({
      properties: new FormGroup({
        carProp: new FormArray([new FormGroup({value: new FormControl('')})]),
      }),
    });

    EntityInstanceUtil.createNewEntityValue(form, prop, 'MyNewCar');

    const newValues: DefaultEntityInstance[] = form.get('newEntityValues')?.value;
    expect(newValues).toBeDefined();
    expect(newValues.length).toBe(1);
    expect(newValues[0].name).toBe('MyNewCar');
  });
});
