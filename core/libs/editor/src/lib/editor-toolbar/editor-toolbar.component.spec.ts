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

import {
  ConfigurationService,
  ExternalEditorAction,
  ExternalEditorService,
  FilterAttributesService,
  FiltersService,
  PluginCommandEntry,
} from '@ame/domain';
import {MaxGraphService, MaxGraphShapeSelectorService, ShapeConnectorService} from '@ame/graph';
import {BindingsService, ModelFilter, NotificationsService} from '@ame/shared';
import {signal} from '@angular/core';
import {ComponentFixture, TestBed} from '@angular/core/testing';
import {MatDialog} from '@angular/material/dialog';
import {DefaultProperty, NamedElement} from '@esmf/aspect-model-loader';
import {TranslocoTestingModule} from '@jsverse/transloco';
import {MockProvider} from 'ng-mocks';
import {BehaviorSubject, of} from 'rxjs';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {AiEditorActionsService} from '../ai/ai-editor-actions.service';
import {ShapeSettingsService} from '../editor-dialog';
import {EditorService} from '../editor.service';
import {ModelHistoryService} from '../history/model-history.service';
import {PluginRuntimeService} from '../plugins/plugin-runtime.service';
import {PrefixManagementService} from '../prefixes/prefix-management.service';
import {ElementRefactoringService} from '../refactoring/element-refactoring.service';
import {EditorToolbarComponent} from './editor-toolbar.component';
import {FileHandlingService} from './services';

describe('EditorToolbarComponent', () => {
  let component: EditorToolbarComponent;
  let fixture: ComponentFixture<EditorToolbarComponent>;
  let editorService: EditorService;
  let fileHandlingService: FileHandlingService;
  let shapeSettingsService: ShapeSettingsService;
  let filtersService: FiltersService;
  let activeFilter$: BehaviorSubject<ModelFilter>;
  let isModelEmpty: ReturnType<typeof signal<boolean>>;
  let canUndo: ReturnType<typeof signal<boolean>>;
  let canRedo: ReturnType<typeof signal<boolean>>;
  let refactoringElement: ReturnType<typeof signal<NamedElement | null>>;
  let elementRefactoring: ElementRefactoringService;
  let pluginCommands: ReturnType<typeof signal<PluginCommandEntry[]>>;
  let pluginRuntime: PluginRuntimeService;
  let aiEnabled: ReturnType<typeof signal<boolean>>;
  let aiPanelOpen: ReturnType<typeof signal<boolean>>;
  let aiActions: AiEditorActionsService;

  const filterButton = (): HTMLElement => fixture.nativeElement.querySelector('[data-testid="tbPropertyFilterButton"]');

  beforeEach(async () => {
    activeFilter$ = new BehaviorSubject<ModelFilter>(ModelFilter.DEFAULT);
    isModelEmpty = signal(false);
    canUndo = signal(false);
    canRedo = signal(false);
    refactoringElement = signal(null);
    pluginCommands = signal<PluginCommandEntry[]>([]);
    aiEnabled = signal(false);
    aiPanelOpen = signal(false);
    await TestBed.configureTestingModule({
      imports: [
        EditorToolbarComponent,
        TranslocoTestingModule.forRoot({langs: {en: {}}, translocoConfig: {availableLangs: ['en'], defaultLang: 'en'}}),
      ],
      providers: [
        MockProvider(FileHandlingService, {
          onValidateFile: vi.fn(),
          copyToClipboard: vi.fn(() => of(null as any)),
        }),
        MockProvider(EditorService, {
          isAllShapesExpanded: signal(true),
          isAllShapesExpanded$: of(true),
          deleteSelectedElements: vi.fn(),
          toggleExpand: vi.fn(),
          formatModel: vi.fn(),
          zoomIn: vi.fn(),
          zoomOut: vi.fn(),
        }),
        MockProvider(ShapeConnectorService, {
          connectSelectedElements: vi.fn(),
        }),
        MockProvider(ConfigurationService, {
          settings$: of({} as any),
        }),
        MockProvider(BindingsService, {
          registerAction: vi.fn(),
        }),
        MockProvider(MaxGraphShapeSelectorService, {
          selectedCells: signal([]),
          hasSelection: signal(false),
          selectTree: vi.fn(),
        }),
        MockProvider(MatDialog),
        MockProvider(ShapeSettingsService, {
          editSelectedCell: vi.fn(),
        }),
        MockProvider(MaxGraphService, {
          isModelEmpty,
        }),
        MockProvider(FiltersService, {renderByFilter: vi.fn()}),
        {
          provide: FilterAttributesService,
          useValue: {
            get activeFilter() {
              return activeFilter$.value;
            },
            activeFilter$: activeFilter$.asObservable(),
          },
        },
        MockProvider(NotificationsService),
        MockProvider(PrefixManagementService, {openManagement: vi.fn()}),
        MockProvider(ModelHistoryService, {canUndo, canRedo, undo: vi.fn(), redo: vi.fn()}),
        MockProvider(PluginRuntimeService, {toolbarCommands: pluginCommands, run: vi.fn(() => Promise.resolve())}),
        MockProvider(ExternalEditorService, {openElement: vi.fn(() => Promise.resolve())}),
        MockProvider(AiEditorActionsService, {
          enabled: aiEnabled,
          registerContextMenuActions: vi.fn(),
          review: vi.fn(),
          examples: vi.fn(),
          explainModel: vi.fn(),
          newModel: vi.fn(),
          togglePanel: vi.fn(),
          panelOpen: aiPanelOpen,
        }),
        MockProvider(ElementRefactoringService, {
          selectedElement: refactoringElement,
          registerContextMenuActions: vi.fn(),
          urnOf: vi.fn((element: NamedElement | null) => element?.aspectModelUrn ?? null),
          blocker: vi.fn(() => null),
          canShowUsages: vi.fn(() => true),
          refactor: vi.fn(),
          showUsages: vi.fn(),
          showHistory: vi.fn(),
        }),
      ],
    }).compileComponents();

    editorService = TestBed.inject(EditorService);
    fileHandlingService = TestBed.inject(FileHandlingService);
    shapeSettingsService = TestBed.inject(ShapeSettingsService);
    filtersService = TestBed.inject(FiltersService);
    elementRefactoring = TestBed.inject(ElementRefactoringService);
    pluginRuntime = TestBed.inject(PluginRuntimeService);
    aiActions = TestBed.inject(AiEditorActionsService);
    fixture = TestBed.createComponent(EditorToolbarComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('onDelete should call editorService.deleteSelectedElements', () => {
    component.onDelete();
    expect(editorService.deleteSelectedElements).toHaveBeenCalled();
  });

  it('onToggleExpand should call editorService.toggleExpand', () => {
    component.onToggleExpand();
    expect(editorService.toggleExpand).toHaveBeenCalled();
  });

  it('onFormat should call editorService.formatModel', () => {
    component.onFormat();
    expect(editorService.formatModel).toHaveBeenCalled();
  });

  it('editSelectedCell should call shapeSettingsService.editSelectedCell', () => {
    component.editSelectedCell();
    expect(shapeSettingsService.editSelectedCell).toHaveBeenCalled();
  });

  it('validateFile should call fileHandlingService.onValidateFile', () => {
    component.validateFile();
    expect(fileHandlingService.onValidateFile).toHaveBeenCalled();
  });

  describe('undo/redo', () => {
    const button = (testId: string): HTMLElement => fixture.nativeElement.querySelector(`[data-testid="${testId}"]`);
    const history = () => TestBed.inject(ModelHistoryService);

    it('disables both buttons without steps', () => {
      expect(button('tbUndoButton').classList).toContain('disabled');
      expect(button('tbRedoButton').classList).toContain('disabled');
      button('tbUndoButton').click();
      expect(history().undo).not.toHaveBeenCalled();
    });

    it('undoes and redoes with the buttons', () => {
      canUndo.set(true);
      canRedo.set(true);
      fixture.detectChanges();

      button('tbUndoButton').click();
      expect(history().undo).toHaveBeenCalled();
      button('tbRedoButton').click();
      expect(history().redo).toHaveBeenCalled();
    });

    it('disables both buttons in the text view', () => {
      canUndo.set(true);
      canRedo.set(true);
      (component as unknown as {isTextView: ReturnType<typeof signal<boolean>>}).isTextView = signal(true);
      fixture.detectChanges();

      expect(button('tbUndoButton').classList).toContain('disabled');
      expect(button('tbRedoButton').classList).toContain('disabled');
    });
  });

  it('should open the prefix management', () => {
    component.openPrefixManagement();
    expect(TestBed.inject(PrefixManagementService).openManagement).toHaveBeenCalled();
  });

  describe('property filter', () => {
    it('should render the property filter button enabled when a model is loaded', () => {
      expect(filterButton()).toBeTruthy();
      expect(filterButton().classList).not.toContain('disabled');
      expect(filterButton().getAttribute('aria-pressed')).toBe('false');
    });

    it('should activate the property filter when inactive', () => {
      filterButton().click();
      expect(filtersService.renderByFilter).toHaveBeenCalledWith(ModelFilter.PROPERTIES);
    });

    it('should deactivate the property filter when active', () => {
      activeFilter$.next(ModelFilter.PROPERTIES);
      fixture.detectChanges();

      expect(filterButton().classList).toContain('toolbar-item--active');
      expect(filterButton().getAttribute('aria-pressed')).toBe('true');

      filterButton().click();
      expect(filtersService.renderByFilter).toHaveBeenCalledWith(ModelFilter.DEFAULT);
    });

    it('should be disabled and not react when no model is loaded', () => {
      isModelEmpty.set(true);
      fixture.detectChanges();

      expect(filterButton().classList).toContain('disabled');
      filterButton().click();
      expect(filtersService.renderByFilter).not.toHaveBeenCalled();
    });
  });

  describe('open in external editor', () => {
    const fireOpenElement = () => {
      const registerAction = vi.mocked(TestBed.inject(BindingsService).registerAction);
      const registration = registerAction.mock.calls.find(([id]) => id === ExternalEditorAction.openElement);
      expect(registration).toBeDefined();
      registration?.[1]();
    };

    it('opens the element selected in the graph context menu', () => {
      refactoringElement.set(
        new DefaultProperty({aspectModelUrn: 'urn:samm:org.example:1.0.0#speed', name: 'speed', metaModelVersion: '2.2.0'}),
      );

      fireOpenElement();

      expect(TestBed.inject(ExternalEditorService).openElement).toHaveBeenCalledWith('urn:samm:org.example:1.0.0#speed');
    });

    it('does nothing without a single selected element', () => {
      fireOpenElement();

      expect(TestBed.inject(ExternalEditorService).openElement).not.toHaveBeenCalled();
    });
  });

  describe('refactoring', () => {
    const speed = new DefaultProperty({aspectModelUrn: 'urn:samm:org.example:1.0.0#speed', name: 'speed', metaModelVersion: '2.2.0'});
    const refactoringButton = (): HTMLElement => fixture.nativeElement.querySelector('[data-testid="tbRefactoringButton"]');
    const menuItem = (testId: string): HTMLButtonElement => document.querySelector(`[data-testid="${testId}"]`);

    const openMenu = async () => {
      refactoringElement.set(speed);
      fixture.detectChanges();
      refactoringButton().click();
      fixture.detectChanges();
      await fixture.whenStable();
    };

    it('registers the refactorings of the graph context menu', () => {
      expect(elementRefactoring.registerContextMenuActions).toHaveBeenCalled();
    });

    it('is disabled without a single selected element', () => {
      expect(refactoringButton().classList).toContain('disabled');

      refactoringButton().click();
      fixture.detectChanges();

      expect(menuItem('tbRefactoringRename')).toBeNull();
    });

    it.each([
      ['tbRefactoringRename', 'RENAME_ELEMENT'],
      ['tbRefactoringMove', 'MOVE_ELEMENT'],
    ])('starts %s for the selected element', async (testId, type) => {
      await openMenu();

      menuItem(testId).click();

      expect(elementRefactoring.refactor).toHaveBeenCalledWith(type, speed);
    });

    it('shows the usages of the selected element', async () => {
      await openMenu();

      menuItem('tbRefactoringUsages').click();

      expect(elementRefactoring.showUsages).toHaveBeenCalledWith(speed);
    });

    it('disables rename and move if the element cannot be refactored', async () => {
      vi.mocked(elementRefactoring.blocker).mockReturnValue('external');
      await openMenu();

      expect(menuItem('tbRefactoringRename').disabled).toBe(true);
      expect(menuItem('tbRefactoringMove').disabled).toBe(true);
      expect(menuItem('tbRefactoringUsages').disabled).toBe(false);
    });

    it('shows the refactoring history without a selected element', () => {
      const historyButton = fixture.nativeElement.querySelector('[data-testid="tbRefactoringHistoryButton"]') as HTMLElement;

      historyButton.click();

      expect(historyButton.classList).not.toContain('disabled');
      expect(elementRefactoring.showHistory).toHaveBeenCalled();
    });
  });

  describe('AI assistant', () => {
    const aiToggle = (): HTMLElement => fixture.nativeElement.querySelector('[data-testid="tbAiToggleButton"]');
    const aiButton = (): HTMLElement => fixture.nativeElement.querySelector('[data-testid="tbAiButton"]');
    const menuItem = (testId: string): HTMLButtonElement => document.querySelector(`[data-testid="${testId}"]`);

    const enable = () => {
      aiEnabled.set(true);
      fixture.detectChanges();
    };

    const openMenu = async () => {
      enable();
      aiButton().click();
      fixture.detectChanges();
      await fixture.whenStable();
    };

    it('registers the context menu actions', () => {
      expect(aiActions.registerContextMenuActions).toHaveBeenCalled();
    });

    it('is hidden while the assistant is disabled', () => {
      expect(aiToggle()).toBeNull();
      expect(aiButton()).toBeNull();
    });

    it('sits at the right end of the toolbar, after the other items', () => {
      enable();
      const host: HTMLElement = fixture.nativeElement;
      expect(host.lastElementChild?.tagName.toLowerCase()).toBe('ame-ai-toolbar-button');
      expect(host.querySelector('.menu-items ame-ai-toolbar-button')).toBeNull();
    });

    it('toggles the panel and shows whether it is open', () => {
      enable();
      aiToggle().click();
      expect(aiActions.togglePanel).toHaveBeenCalled();

      aiPanelOpen.set(true);
      fixture.detectChanges();
      expect(aiToggle().getAttribute('aria-pressed')).toBe('true');
    });

    it('runs the actions of the menu', async () => {
      for (const testId of ['tbAiReview', 'tbAiExamples', 'tbAiExplain', 'tbAiNewModel']) {
        await openMenu();
        menuItem(testId).click();
      }

      expect(aiActions.review).toHaveBeenCalled();
      expect(aiActions.examples).toHaveBeenCalled();
      expect(aiActions.explainModel).toHaveBeenCalled();
      expect(aiActions.newModel).toHaveBeenCalled();
    });

    it('disables the actions about the model while it is empty', async () => {
      isModelEmpty.set(true);
      await openMenu();

      expect(menuItem('tbAiReview').disabled).toBe(true);
      expect(menuItem('tbAiExamples').disabled).toBe(true);
      expect(menuItem('tbAiExplain').disabled).toBe(true);
      expect(menuItem('tbAiNewModel').disabled).toBe(false);
    });
  });

  describe('plugins', () => {
    const command = (overrides: Partial<PluginCommandEntry>): PluginCommandEntry => ({
      pluginId: 'example',
      commandId: 'export',
      kind: 'generate',
      label: 'Generate as JSON description...',
      icon: 'output',
      placements: ['toolbar'],
      menu: 'generate',
      ...overrides,
    });
    const pluginsButton = (): HTMLElement => fixture.nativeElement.querySelector('[data-testid="tbPluginsButton"]');
    const menuItem = (testId: string): HTMLButtonElement => document.querySelector(`[data-testid="${testId}"]`);

    const openMenu = async () => {
      fixture.detectChanges();
      pluginsButton().click();
      fixture.detectChanges();
      await fixture.whenStable();
    };

    it('is hidden without toolbar commands', () => {
      expect(pluginsButton()).toBeNull();
    });

    it('runs the commands of the plugins', async () => {
      pluginCommands.set([
        command({commandId: 'import', kind: 'import', label: 'Import from JSON description...', icon: 'upload_file'}),
        command({}),
      ]);
      await openMenu();

      const exportItem = menuItem('tbPluginCommand-example-export');
      expect(exportItem.textContent).toContain('Generate as JSON description...');
      expect(exportItem.textContent).toContain('output');
      exportItem.click();

      expect(pluginRuntime.run).toHaveBeenCalledWith('example', 'export');
    });

    it('disables generators while the model is empty', async () => {
      isModelEmpty.set(true);
      pluginCommands.set([command({commandId: 'import', kind: 'import'}), command({})]);
      await openMenu();

      expect(menuItem('tbPluginCommand-example-import').disabled).toBe(false);
      expect(menuItem('tbPluginCommand-example-export').disabled).toBe(true);
    });
  });
});
