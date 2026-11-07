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

import {ModelValidationStore, QuickFix, ViolationError} from '@ame/domain';
import {LanguageTranslationService, NotificationModel, NotificationsService, NotificationType} from '@ame/shared';
import {signal} from '@angular/core';
import {TestBed} from '@angular/core/testing';
import {RdfModel} from '@esmf/aspect-model-loader';
import {DataFactory, Store} from 'n3';
import {MockProvider} from 'ng-mocks';
import {of, throwError} from 'rxjs';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {ModelHistoryService} from '../history/model-history.service';
import {ModelSavingTrackerService} from '../model-saving-tracker.service';
import {TabStateService} from '../tabs/tab-state.service';
import {QuickFixService} from './quick-fix.service';

const ELEMENT = 'urn:samm:org.example:1.0.0#Movement';
const DESCRIPTION = 'urn:samm:org.eclipse.esmf.samm:meta-model:2.2.0#description';

describe('QuickFixService', () => {
  let service: QuickFixService;
  let validationStore: InstanceType<typeof ModelValidationStore>;
  let notifications: NotificationsService;
  let tabState: TabStateService;
  let store: Store;
  let applyModelChange: ReturnType<typeof vi.fn<ModelHistoryService['applyModelChange']>>;

  const fix: QuickFix = {
    description: 'Add the language tag',
    element: ELEMENT,
    property: DESCRIPTION,
    oldValue: {value: 'A movement', datatype: 'http://www.w3.org/2001/XMLSchema#string', language: ''},
    newValue: {value: 'A movement', datatype: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#langString', language: 'en'},
  };
  const violation: ViolationError = {message: 'Missing language tag', focusNode: ELEMENT, fix: [], quickFixes: [fix]};
  const other: ViolationError = {message: 'Other problem', focusNode: ELEMENT, fix: []};
  const notificationOf = (error: ViolationError) => new NotificationModel(error.message, '', error.focusNode, NotificationType.Error);

  beforeEach(() => {
    store = new Store([
      DataFactory.quad(DataFactory.namedNode(ELEMENT), DataFactory.namedNode(DESCRIPTION), DataFactory.literal('A movement')),
    ]);
    applyModelChange = vi.fn<ModelHistoryService['applyModelChange']>(change => of(change({store} as RdfModel)));

    TestBed.configureTestingModule({
      providers: [
        QuickFixService,
        MockProvider(ModelHistoryService, {applyModelChange}),
        MockProvider(ModelSavingTrackerService, {isSaved$: of(false)}),
        MockProvider(TabStateService, {activeTabId: signal('tab-1'), setTabDirty: vi.fn()}),
        MockProvider(NotificationsService, {clearNotifications: vi.fn(), success: vi.fn(), warning: vi.fn(), error: vi.fn()}),
        MockProvider(LanguageTranslationService, {translateService: {translate: (key: string) => key}} as never),
      ],
    });

    service = TestBed.inject(QuickFixService);
    validationStore = TestBed.inject(ModelValidationStore);
    notifications = TestBed.inject(NotificationsService);
    tabState = TestBed.inject(TabStateService);
    validationStore.setViolations([violation, other]);
  });

  describe('fixesOf', () => {
    it('finds the quick fixes of the violation the notification reports', () => {
      expect(service.fixesOf(notificationOf(violation))).toEqual([fix]);
    });

    it('has no quick fixes for other notifications', () => {
      expect(service.fixesOf(notificationOf(other))).toEqual([]);
      expect(service.fixesOf(new NotificationModel(violation.message, '', 'urn:samm:org.example:1.0.0#Other'))).toEqual([]);
      expect(service.fixesOf(new NotificationModel(violation.message))).toEqual([]);
      expect(service.fixesOf(null)).toEqual([]);
    });
  });

  describe('apply', () => {
    it('changes the model as one step, marks the tab as changed and removes the fixed violation', () => {
      const notification = notificationOf(violation);
      const result = vi.fn();
      service.apply(fix, notification).subscribe(result);

      expect(result).toHaveBeenCalledWith(true);
      expect(applyModelChange).toHaveBeenCalledTimes(1);
      expect(store.getQuads(null, null, DataFactory.literal('A movement', 'en'), null)).toHaveLength(1);
      expect(validationStore.violations()).toEqual([other]);
      expect(notifications.clearNotifications).toHaveBeenCalledWith([notification]);
      expect(tabState.setTabDirty).toHaveBeenCalledWith('tab-1', true);
      expect(notifications.success).toHaveBeenCalledWith({title: 'quickFix.applied', message: fix.description});
    });

    it('informs the user when the model no longer contains the old value', () => {
      store.removeQuads(store.getQuads(null, null, null, null));
      const result = vi.fn();
      service.apply(fix).subscribe(result);

      expect(result).toHaveBeenCalledWith(false);
      expect(notifications.warning).toHaveBeenCalledWith({title: 'quickFix.outdated', timeout: 5000});
      expect(validationStore.violations()).toEqual([violation, other]);
      expect(tabState.setTabDirty).not.toHaveBeenCalled();
    });

    it('informs the user when the changed model cannot be loaded', () => {
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      applyModelChange.mockReturnValue(throwError(() => new Error('broken')));
      const result = vi.fn();
      service.apply(fix).subscribe(result);

      expect(result).toHaveBeenCalledWith(false);
      expect(notifications.error).toHaveBeenCalledWith({title: 'quickFix.failed'});
      expect(validationStore.violations()).toEqual([violation, other]);
    });
  });
});
