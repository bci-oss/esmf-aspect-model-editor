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

import {ModelApiService} from '@ame/api';
import {LoadedFilesService} from '@ame/cache';
import {EditorService, ModelLoaderService} from '@ame/editor';
import {MaxGraphService} from '@ame/max-graph';
import {provideZonelessChangeDetection} from '@angular/core';
import {ComponentFixture, TestBed} from '@angular/core/testing';
import {NoopAnimationsModule} from '@angular/platform-browser/animations';
import {DefaultProperty} from '@esmf/aspect-model-loader';
import {TranslocoTestingModule} from '@jsverse/transloco';
import {of} from 'rxjs';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {FileStatus, SidebarStateService} from '../../sidebar-state.service';
import {WorkspaceFileElementsComponent} from './workspace-file-elements.component';

describe('WorkspaceFileElementsComponent', () => {
  let component: WorkspaceFileElementsComponent;
  let fixture: ComponentFixture<WorkspaceFileElementsComponent>;
  let sidebarService: SidebarStateService;
  let maxgraphMock: {resolveCellByModelElement: ReturnType<typeof vi.fn>};
  let modelApiMock: {fetchAspectMetaModel: ReturnType<typeof vi.fn>};
  let modelLoaderMock: {loadSingleModel: ReturnType<typeof vi.fn>};
  let loadedFilesMock: {getFile: ReturnType<typeof vi.fn>};

  beforeEach(() => {
    vi.useFakeTimers();

    maxgraphMock = {
      resolveCellByModelElement: vi.fn(),
    };
    modelApiMock = {
      fetchAspectMetaModel: vi.fn(() =>
        of({
          sourceLocation: '/models/Aspect.ttl',
          content: 'turtle-content',
        }),
      ),
    };

    const mockProperty = new DefaultProperty({
      name: 'prop1',
      aspectModelUrn: 'urn:samm:org.eclipse.esmf:1.0.0#prop1',
      metaModelVersion: '2.1.0',
    });
    const mockCachedFile = {
      cachedFile: {
        getAllElements: () => [mockProperty],
      },
    };

    modelLoaderMock = {
      loadSingleModel: vi.fn(() => of(mockCachedFile)),
    };

    loadedFilesMock = {
      getFile: vi.fn((key: string) => {
        if (key === 'org.eclipse.esmf:1.0.0:Cached.ttl') {
          return mockCachedFile;
        }
        return null;
      }),
    };

    TestBed.configureTestingModule({
      imports: [
        WorkspaceFileElementsComponent,
        NoopAnimationsModule,
        TranslocoTestingModule.forRoot({langs: {en: {}}, translocoConfig: {availableLangs: ['en'], defaultLang: 'en'}}),
      ],
      providers: [
        provideZonelessChangeDetection(),
        SidebarStateService,
        {provide: MaxGraphService, useValue: maxgraphMock},
        {provide: ModelApiService, useValue: modelApiMock},
        {provide: ModelLoaderService, useValue: modelLoaderMock},
        {provide: LoadedFilesService, useValue: loadedFilesMock},
        {provide: EditorService, useValue: {makeDraggable: vi.fn()}},
      ],
    });

    sidebarService = TestBed.inject(SidebarStateService);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should create the component', () => {
    fixture = TestBed.createComponent(WorkspaceFileElementsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    expect(component).toBeTruthy();
  });

  it('should load elements from cached file when selection changes to cached file', () => {
    fixture = TestBed.createComponent(WorkspaceFileElementsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();

    const file = new FileStatus('Cached.ttl');
    file.aspectModelUrn = 'urn:samm:org.eclipse.esmf:1.0.0#Cached';
    sidebarService.selection.select('org.eclipse.esmf:1.0.0', file);
    TestBed.flushEffects();

    expect(component.elements()['property']?.elements?.length).toBe(1);
    expect(component.elements()['property']?.elements[0].name).toBe('prop1');
  });

  it('should fetch and load elements via API when file is not yet cached', () => {
    fixture = TestBed.createComponent(WorkspaceFileElementsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();

    const file = new FileStatus('Remote.ttl');
    file.aspectModelUrn = 'urn:samm:org.eclipse.esmf:1.0.0#Remote';
    sidebarService.selection.select('org.eclipse.esmf:1.0.0', file);
    TestBed.flushEffects();

    expect(modelApiMock.fetchAspectMetaModel).toHaveBeenCalledWith('urn:samm:org.eclipse.esmf:1.0.0#Remote');
    expect(modelLoaderMock.loadSingleModel).toHaveBeenCalled();
    expect(component.elements()['property']?.elements?.length).toBe(1);
  });

  it('should determine if an element is imported into canvas', () => {
    fixture = TestBed.createComponent(WorkspaceFileElementsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();

    const element = new DefaultProperty({
      name: 'prop1',
      aspectModelUrn: 'urn:samm:org.eclipse.esmf:1.0.0#prop1',
      metaModelVersion: '2.1.0',
    });
    maxgraphMock.resolveCellByModelElement.mockReturnValue(true);
    expect(component.elementImported(element)).toBe(true);

    maxgraphMock.resolveCellByModelElement.mockReturnValue(null);
    expect(component.elementImported(element)).toBe(false);

    expect(component.elementImported(null as any)).toBe(false);
  });

  it('should toggle element filter visibility', () => {
    fixture = TestBed.createComponent(WorkspaceFileElementsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();

    const file = new FileStatus('Cached.ttl');
    file.aspectModelUrn = 'urn:samm:org.eclipse.esmf:1.0.0#Cached';
    sidebarService.selection.select('org.eclipse.esmf:1.0.0', file);
    TestBed.flushEffects();

    expect(component.elements()['property'].displayed).toBe(true);
    component.toggleFilter({stopPropagation: vi.fn()} as any, 'property');
    expect(component.elements()['property'].displayed).toBe(false);
  });

  it('should filter elements on search input', () => {
    fixture = TestBed.createComponent(WorkspaceFileElementsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();

    const file = new FileStatus('Cached.ttl');
    file.aspectModelUrn = 'urn:samm:org.eclipse.esmf:1.0.0#Cached';
    sidebarService.selection.select('org.eclipse.esmf:1.0.0', file);
    TestBed.flushEffects();

    component.search({target: {value: 'prop1'}} as any);
    vi.advanceTimersByTime(150);
    expect(component.searched()['property']).toHaveLength(1);

    component.search({target: {value: 'nonexistent'}} as any);
    vi.advanceTimersByTime(150);
    expect(component.searched()['property']).toHaveLength(0);
  });
});
