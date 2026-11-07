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

import {QuickFix} from '@ame/domain';
import {ClipboardService, IPC_RENDERER, NotificationModel, NotificationsService, NotificationType} from '@ame/shared';
import {ComponentFixture, TestBed} from '@angular/core/testing';
import {MatDialogRef} from '@angular/material/dialog';
import {ActivatedRoute, Router} from '@angular/router';
import {TranslocoTestingModule} from '@jsverse/transloco';
import {MockProvider} from 'ng-mocks';
import {of, Subject} from 'rxjs';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {QuickFixService} from '../../../quick-fix/quick-fix.service';
import {NotificationsComponent} from './notifications.component';

describe('NotificationsComponent', () => {
  let component: NotificationsComponent;
  let fixture: ComponentFixture<NotificationsComponent>;
  let notificationsService: NotificationsService;
  let dialogRef: MatDialogRef<NotificationsComponent>;
  let router: Router;
  let copyToClipboardMock: ReturnType<typeof vi.fn>;
  let quickFixService: QuickFixService;
  let fixes: QuickFix[];

  const fix: QuickFix = {
    description: 'Add the language tag',
    element: 'urn:samm:org.example:1.0.0#Aspect',
    property: 'urn:samm:org.eclipse.esmf.samm:meta-model:2.2.0#description',
    oldValue: {value: 'text', datatype: 'http://www.w3.org/2001/XMLSchema#string', language: ''},
    newValue: {value: 'text', datatype: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#langString', language: 'en'},
  };

  const mockNotification = new NotificationModel('Warning Title', 'Warning Message', undefined, NotificationType.Warning);
  mockNotification.expanded = true;

  beforeEach(async () => {
    copyToClipboardMock = vi.fn();
    fixes = [];
    dialogRef = {
      close: vi.fn(),
    } as unknown as MatDialogRef<NotificationsComponent>;

    await TestBed.configureTestingModule({
      imports: [
        NotificationsComponent,
        TranslocoTestingModule.forRoot({langs: {en: {}}, translocoConfig: {availableLangs: ['en'], defaultLang: 'en'}}),
      ],
      providers: [
        {provide: MatDialogRef, useValue: dialogRef},
        {provide: IPC_RENDERER, useValue: {copyToClipboard: copyToClipboardMock}},
        MockProvider(NotificationsService, {
          getNotifications: vi.fn(() => [mockNotification]),
          clearNotifications: vi.fn(),
        }),
        MockProvider(Router, {
          navigate: vi.fn(),
        }),
        MockProvider(ActivatedRoute),
        MockProvider(QuickFixService, {
          fixesOf: vi.fn(notification => (notification ? fixes : [])),
          apply: vi.fn(() => of(true)),
        }),
      ],
    }).compileComponents();

    notificationsService = TestBed.inject(NotificationsService);
    router = TestBed.inject(Router);
    quickFixService = TestBed.inject(QuickFixService);
    fixture = TestBed.createComponent(NotificationsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create and reset expanded state on init', () => {
    expect(component).toBeTruthy();
    expect(mockNotification.expanded).toBe(false);
  });

  it('getTypeIcon should return correct icon name', () => {
    expect(component.getTypeIcon(NotificationType.Warning)).toBe('warning_amber');
    expect(component.getTypeIcon(NotificationType.Error)).toBe('error_outline');
    expect(component.getTypeIcon(NotificationType.Info)).toBe('info_outline');
  });

  it('clearNotification and clearAllNotifications should call service', () => {
    component.clearNotification(mockNotification);
    expect(notificationsService.clearNotifications).toHaveBeenCalledWith([mockNotification]);

    component.clearAllNotifications();
    expect(notificationsService.clearNotifications).toHaveBeenCalledWith();
  });

  it('goTo should navigate with urn and close dialog', () => {
    component.goTo('urn:test#Prop');
    expect(router.navigate).toHaveBeenCalled();
    expect(dialogRef.close).toHaveBeenCalled();
  });

  it('copyToClipboard should delegate to ipcRenderer and track copied element', () => {
    component.copyToClipboard('Some error text', mockNotification);
    expect(copyToClipboardMock).toHaveBeenCalledWith('Some error text');
    expect(component.copiedElement()).toBe(mockNotification);
  });

  it('copyToClipboard should use the shared ClipboardService', () => {
    const copy = vi.spyOn(TestBed.inject(ClipboardService), 'copy');
    component.copyToClipboard('text');
    expect(copy).toHaveBeenCalledWith('text');
  });

  it('copyToClipboard should do nothing if text is empty', () => {
    component.copyToClipboard('');
    expect(copyToClipboardMock).not.toHaveBeenCalled();
  });

  describe('quick fixes', () => {
    const quickFixButton = () => fixture.nativeElement.querySelector('[data-testid="quick-fix-button"]');

    it('offers the quick fixes only for notifications of violations which have some', () => {
      expect(quickFixButton()).toBeNull();
      expect(component.currentQuickFixes()).toEqual([]);

      fixes = [fix];
      fixture = TestBed.createComponent(NotificationsComponent);
      component = fixture.componentInstance;
      fixture.detectChanges();
      component.currentItem.set(mockNotification);

      expect(quickFixButton()).not.toBeNull();
      expect(component.hasQuickFixes(mockNotification)).toBe(true);
      expect(component.currentQuickFixes()).toEqual([fix]);
    });

    it('applies the quick fix for the current notification', () => {
      component.currentItem.set(mockNotification);
      component.applyQuickFix(fix);

      expect(quickFixService.apply).toHaveBeenCalledWith(fix, mockNotification);
      expect(component.applyingQuickFix()).toBe(false);
    });

    it('is busy while the quick fix is applied', () => {
      const result = new Subject<boolean>();
      vi.mocked(quickFixService.apply).mockReturnValue(result);

      component.applyQuickFix(fix);
      expect(component.applyingQuickFix()).toBe(true);

      result.next(true);
      result.complete();
      expect(component.applyingQuickFix()).toBe(false);
    });
  });
});
