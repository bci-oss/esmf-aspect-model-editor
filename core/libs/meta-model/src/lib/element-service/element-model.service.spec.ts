import {LoadedFilesService} from '@ame/cache';
import {RenameModelDialogService} from '@ame/editor';
import {MaxGraphHelper, MaxGraphService} from '@ame/max-graph';
import {ModelService} from '@ame/rdf/services';
import {NotificationsService, TitleService} from '@ame/shared';
import {LanguageTranslationService} from '@ame/translation';
import {TestBed} from '@angular/core/testing';
import {DefaultCharacteristic, DefaultProperty} from '@esmf/aspect-model-loader';
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
        {provide: TitleService, useValue: {updateTitle: vi.fn()}},
        {provide: ModelService, useValue: {removeAspect: vi.fn()}},
        {provide: RenameModelDialogService, useValue: {open: vi.fn()}},
        {
          provide: LanguageTranslationService,
          useValue: {
            language: {
              notificationService: {
                modelEmptyMessage: 'Empty',
                modelMinimumElementRequirement: 'Min 1',
                cannotDeleteEdgeTitle: 'Cannot remove connection',
                cannotDeleteEdgeMessage:
                  'It is not possible to remove connections directly. Please remove or reconnect the elements accordingly.',
              },
            },
          },
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

  it('should prevent edge delete and show warning notification instead', () => {
    const edge = new Cell();
    edge.edge = true;

    service.deleteElement(edge);
    expect(mockNotificationService.warning).toHaveBeenCalledWith({
      title: 'Cannot remove connection',
      message: 'It is not possible to remove connections directly. Please remove or reconnect the elements accordingly.',
      timeout: 5000,
    });
    expect(mockMaxgraphService.removeCells).not.toHaveBeenCalled();
  });
});
