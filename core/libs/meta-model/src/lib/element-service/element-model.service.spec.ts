import {LoadedFilesService} from '@ame/cache';
import {EntityInstanceService, RenameModelDialogService} from '@ame/editor';
import {MaxGraphHelper, MaxGraphService, MaxGraphShapeOverlayService} from '@ame/max-graph';
import {ModelService} from '@ame/rdf/services';
import {SammLanguageSettingsService} from '@ame/settings-dialog';
import {NotificationsService, TitleService} from '@ame/shared';
import {LanguageTranslationService} from '@ame/translation';
import {TestBed} from '@angular/core/testing';
import {DefaultCharacteristic, DefaultEntity, DefaultProperty} from '@esmf/aspect-model-loader';
import {Cell, Graph} from '@maxgraph/core';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {CharacteristicModelService} from './characteristic-model.service';
import {ElementModelService} from './element-model.service';
import {ModelRootService} from './model-root.service';

describe('ElementModelService', () => {
  let service: ElementModelService;
  let mockMaxgraphService: any;
  let mockModelRootService: any;
  let mockNotificationService: any;
  let mockLoadedFilesService: any;

  beforeEach(() => {
    const graph = {
      getIncomingEdges: vi.fn().mockReturnValue([]),
      getOutgoingEdges: vi.fn().mockReturnValue([]),
      labelChanged: vi.fn(),
    } as unknown as Graph;
    mockMaxgraphService = {
      graph,
      getAllCells: vi.fn().mockReturnValue([new Cell(), new Cell()]),
      removeCells: vi.fn(),
      resolveParents: vi.fn().mockReturnValue([]),
      updateEnumerationsWithEntityValue: vi.fn(),
      updateEntityValuesWithCellReference: vi.fn(),
    };

    const mockElementModelService = {
      update: vi.fn(),
      delete: vi.fn(),
    };

    mockModelRootService = {
      getElementModelService: vi.fn().mockReturnValue(mockElementModelService),
      isPredefined: vi.fn().mockReturnValue(false),
      getPredefinedService: vi.fn().mockReturnValue(null),
    };

    mockNotificationService = {warning: vi.fn()};
    mockLoadedFilesService = {
      isElementExtern: vi.fn().mockReturnValue(false),
      isElementInCurrentFile: vi.fn().mockReturnValue(true),
      currentLoadedFile: {
        namespace: 'org.eclipse.esmf.test',
        cachedFile: {
          removeElement: vi.fn(),
        },
      },
    };

    TestBed.configureTestingModule({
      providers: [
        ElementModelService,
        {provide: MaxGraphService, useValue: mockMaxgraphService},
        {provide: ModelRootService, useValue: mockModelRootService},
        {provide: NotificationsService, useValue: mockNotificationService},
        {provide: LoadedFilesService, useValue: mockLoadedFilesService},
        {
          provide: MaxGraphShapeOverlayService,
          useValue: {removeComplexTypeShapeOverlays: vi.fn(), addBottomShapeOverlay: vi.fn(), checkAndAddShapeActionIcon: vi.fn()},
        },
        {provide: TitleService, useValue: {updateTitle: vi.fn()}},
        {provide: EntityInstanceService, useValue: {onPropertyRemove: vi.fn((_, cb) => cb()), onEntityDisconnect: vi.fn()}},
        {provide: SammLanguageSettingsService, useValue: {}},
        {provide: ModelService, useValue: {removeAspect: vi.fn()}},
        {provide: RenameModelDialogService, useValue: {open: vi.fn()}},
        {
          provide: LanguageTranslationService,
          useValue: {language: {notificationService: {modelEmptyMessage: 'Empty', modelMinimumElementRequirement: 'Min 1'}}},
        },
        {provide: CharacteristicModelService, useValue: mockElementModelService},
      ],
    });

    service = TestBed.inject(ElementModelService);
  });

  it('should update element through its model service', () => {
    const char = new DefaultCharacteristic({name: 'C', aspectModelUrn: 'urn:test#C', metaModelVersion: '2.2.0'});
    const cell = new Cell();
    MaxGraphHelper.setElementNode(cell, {element: char} as any);

    service.updateElement(cell, {name: 'C2'});
    expect(mockModelRootService.getElementModelService).toHaveBeenCalledWith(char);
  });

  it('should prevent delete if only 1 cell remains in graph', () => {
    mockMaxgraphService.getAllCells.mockReturnValue([new Cell()]);
    const cell = new Cell();
    service.deleteElement(cell);
    expect(mockNotificationService.warning).toHaveBeenCalled();
  });

  it('should delete element data when more than 1 cell exists', () => {
    const prop = new DefaultProperty({name: 'p', aspectModelUrn: 'urn:test#p', metaModelVersion: '2.2.0'});
    const cell = new Cell();
    MaxGraphHelper.setElementNode(cell, {element: prop} as any);

    service.deleteElement(cell);
    expect(mockLoadedFilesService.currentLoadedFile.cachedFile.removeElement).toHaveBeenCalledWith('urn:test#p');
  });

  it('should decouple elements on edge delete', () => {
    const parent = new DefaultEntity({name: 'Entity', aspectModelUrn: 'urn:test#Entity', metaModelVersion: '2.2.0'});
    const child = new DefaultProperty({name: 'Property', aspectModelUrn: 'urn:test#Property', metaModelVersion: '2.2.0'});

    parent.children.push(child);
    child.parents.push(parent);

    const sourceCell = new Cell();
    MaxGraphHelper.setElementNode(sourceCell, {element: parent} as any);

    const targetCell = new Cell();
    MaxGraphHelper.setElementNode(targetCell, {element: child} as any);

    const edge = new Cell();
    edge.edge = true;
    edge.source = sourceCell;
    edge.target = targetCell;

    service.decoupleElements(edge);
    expect(mockMaxgraphService.removeCells).toHaveBeenCalledWith([edge]);
  });
});
