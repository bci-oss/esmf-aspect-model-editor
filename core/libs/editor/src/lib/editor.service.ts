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

import {ModelApiService} from '@ame/api';
import {LoadedFilesService, NamespaceFile} from '@ame/cache';
import {FILTER_ATTRIBUTES, FilterAttributesService, FiltersService} from '@ame/loader-filters';
import {ElementModelService, ModelElementNamingService} from '@ame/meta-model';
import {
  MxGraphAttributeService,
  MxGraphHelper,
  MxGraphRenderer,
  MxGraphService,
  MxGraphSetupService,
  MxGraphShapeOverlayService,
  MxGraphShapeSelectorService,
  ShapeConfiguration,
  mxConstants,
  mxEvent,
  mxUtils,
} from '@ame/mx-graph';
import {ModelService, RdfService} from '@ame/rdf/services';
import {ConfigurationService, SammLanguageSettingsService} from '@ame/settings-dialog';
import {
  AlertService,
  LoadingScreenService,
  ModelSavingTrackerService,
  NotificationsService,
  SaveValidateErrorsCodes,
  TitleService,
  ValidateStatus,
  createEmptyElement,
  sammElements,
} from '@ame/shared';
import {SidebarStateService} from '@ame/sidebar';
import {LanguageTranslationService} from '@ame/translation';
import {Injectable, Injector, NgZone, inject} from '@angular/core';
import {Aspect, DefaultAspect, NamedElement, RdfModel} from '@esmf/aspect-model-loader';
import {environment} from 'environments/environment';
import {mxgraph} from 'mxgraph-factory';
import {
  BehaviorSubject,
  Observable,
  Subscription,
  catchError,
  delay,
  delayWhen,
  filter,
  first,
  map,
  of,
  retry,
  switchMap,
  tap,
  throwError,
  timer,
} from 'rxjs';
import {ConfirmDialogService} from './confirm-dialog/confirm-dialog.service';
import {ShapeSettingsService, ShapeSettingsStateService} from './editor-dialog';
import {AsyncApi, OpenApi, ViolationError} from './editor-toolbar';
import {LargeFileWarningService} from './large-file-warning-dialog/large-file-warning-dialog.service';
import {ModelLoaderService} from './model-loader.service';
import {ConfirmDialogEnum} from './models/confirm-dialog.enum';

@Injectable({
  providedIn: 'root',
})
export class EditorService {
  private filtersService: FiltersService = inject(FiltersService);
  private filterAttributes: FilterAttributesService = inject(FILTER_ATTRIBUTES);
  private configurationService: ConfigurationService = inject(ConfigurationService);
  private modelLoaderService: ModelLoaderService = inject(ModelLoaderService);

  private validateModelSubscription$: Subscription;
  private saveModelSubscription$: Subscription;

  private isAllShapesExpandedSubject = new BehaviorSubject<boolean>(true);

  public isAllShapesExpanded$ = this.isAllShapesExpandedSubject.asObservable();
  public delayedBindings: Array<any> = [];

  private get settings() {
    return this.configurationService.getSettings();
  }

  get shapeSettingsService(): ShapeSettingsService {
    return this.injector.get(ShapeSettingsService);
  }

  get currentLoadedFile() {
    return this.loadedFilesService.currentLoadedFile;
  }

  constructor(
    private mxGraphService: MxGraphService,
    private mxGraphSetupService: MxGraphSetupService,
    private notificationsService: NotificationsService,
    private modelApiService: ModelApiService,
    private modelService: ModelService,
    private alertService: AlertService,
    private rdfService: RdfService,
    private sammLangService: SammLanguageSettingsService,
    private modelElementNamingService: ModelElementNamingService,
    private mxGraphShapeOverlayService: MxGraphShapeOverlayService,
    private mxGraphShapeSelectorService: MxGraphShapeSelectorService,
    private mxGraphAttributeService: MxGraphAttributeService,
    private confirmDialogService: ConfirmDialogService,
    private elementModelService: ElementModelService,
    private titleService: TitleService,
    private sidebarService: SidebarStateService,
    private shapeSettingsStateService: ShapeSettingsStateService,
    private modelSavingTracker: ModelSavingTrackerService,
    private largeFileWarningService: LargeFileWarningService,
    private loadingScreenService: LoadingScreenService,
    private translate: LanguageTranslationService,
    private injector: Injector,
    private ngZone: NgZone,
    private loadedFilesService: LoadedFilesService,
  ) {
    if (!environment.production) {
      window['angular.editorService'] = this;
    }
  }

  initCanvas(): void {
    this.mxGraphService.initGraph();

    this.enableAutoValidation();
    this.enableAutoSave();

    mxEvent.addMouseWheelListener(
      mxUtils.bind(this, (evt, up) => {
        this.ngZone.run(() => {
          if (!mxEvent.isConsumed(evt) && evt.altKey) {
            if (up) {
              this.mxGraphAttributeService.graph.zoomIn();
            } else {
              this.mxGraphAttributeService.graph.zoomOut();
            }
            mxEvent.consume(evt);
          }
        });
      }),
      null,
    );

    // TODO: Check this when refactoring editor service
    // enforce parent domain object will be updated if an cell e.g. unit will be deleted
    this.mxGraphAttributeService.graph.addListener(
      mxEvent.CELLS_REMOVED,
      mxUtils.bind(this, (_source: mxgraph.mxGraph, event: mxgraph.mxEventObject) => {
        this.ngZone.run(() => {
          if (this.filterAttributes.isFiltering) {
            return;
          }

          const changedCells: Array<mxgraph.mxCell> = event.getProperty('cells');
          changedCells.forEach(cell => {
            if (!MxGraphHelper.getModelElement(cell)) {
              return;
            }

            const edgeParent = changedCells.find(edge => edge.isEdge() && edge.target && edge.target.id === cell.id);
            if (!edgeParent) {
              return;
            }

            const sourceElement = MxGraphHelper.getModelElement<NamedElement>(edgeParent.source);
            if (sourceElement && !sourceElement?.isExternalReference()) {
              // TODO update delete functionality
              // sourceElement.delete(MxGraphHelper.getModelElement(cell));
            }
          });
        });
      }),
    );

    // increase performance by not passing the event to the parent(s)
    this.mxGraphAttributeService.graph.getModel().addListener(mxEvent.CHANGE, function (sender, evt) {
      evt.consume();
    });

    this.delayedBindings.forEach(binding => this.bindAction(binding.actionname, binding.funct));
    this.delayedBindings = [];
    this.mxGraphAttributeService.graph.view.setTranslate(0, 0);
  }

  bindAction(actionName: string, callback: Function) {
    if (!this.mxGraphAttributeService.graph) {
      this.delayedBindings.push({
        actionname: actionName,
        funct: callback,
      });
      return;
    }
    this.mxGraphAttributeService.editor.addAction(actionName, callback);
  }

  handleFileVersionConflicts(fileName: string, fileContent: string): Observable<RdfModel> {
    const currentModel = this.currentLoadedFile;

    if (!currentModel.fromWorkspace || fileName !== this.currentLoadedFile.absoluteName) return of(this.currentLoadedFile.rdfModel);

    return this.rdfService.isSameModelContent(fileName, fileContent, currentModel).pipe(
      switchMap(isSameModelContent => (!isSameModelContent ? this.openReloadConfirmationDialog(currentModel.absoluteName) : of(false))),
      switchMap(isApprove => (isApprove ? this.modelLoaderService.createRdfModelFromContent(fileContent, fileName) : of(null))),
      map((file: NamespaceFile) => file.rdfModel),
    );
  }

  openReloadConfirmationDialog(fileName: string): Observable<boolean> {
    return this.confirmDialogService
      .open({
        phrases: [
          `${this.translate.language.CONFIRM_DIALOG.RELOAD_CONFIRMATION.VERSION_CHANGE_NOTICE} ${fileName} ${this.translate.language.CONFIRM_DIALOG.RELOAD_CONFIRMATION.WORKSPACE_LOAD_NOTICE}`,
          this.translate.language.CONFIRM_DIALOG.RELOAD_CONFIRMATION.RELOAD_WARNING,
        ],
        title: this.translate.language.CONFIRM_DIALOG.RELOAD_CONFIRMATION.TITLE,
        closeButtonText: this.translate.language.CONFIRM_DIALOG.RELOAD_CONFIRMATION.CLOSE_BUTTON,
        okButtonText: this.translate.language.CONFIRM_DIALOG.RELOAD_CONFIRMATION.OK_BUTTON,
      })
      .pipe(map(confirm => confirm === ConfirmDialogEnum.ok));
  }

  // @TODO move this function and redo it
  // :CachedFile {
  loadExternalAspectModel(extRefAbsoluteAspectModelFileName: string): any {
    // const extRdfModel = this.rdfService.externalRdfModels.find(
    //   extRef => extRef.absoluteAspectModelFileName === extRefAbsoluteAspectModelFileName,
    // );
    // const fileName = extRdfModel.aspectModelFileName;
    // let foundCachedFile = this.namespaceCacheService.getFile([extRdfModel.getAspectModelUrn(), fileName]);
    // if (!foundCachedFile) {
    //   foundCachedFile = this.namespaceCacheService.addFile(extRdfModel.getAspectModelUrn(), fileName);
    //   // @TODO check rdfModel
    //   foundCachedFile = this.instantiatorService.instantiateFile(extRdfModel as any, foundCachedFile, fileName);
    // }

    return null; //foundCachedFile;
  }

  // @TODO move this function to model-loader service and use the new rdf loader
  loadExternalModels(): Observable<Array<RdfModel>> {
    // this.rdfService.externalRdfModels = [];
    // return this.modelApiService.getAllNamespacesFilesContent().pipe(
    //   first(),
    //   mergeMap((fileContentModels: Array<FileContentModel>) =>
    //     fileContentModels.length
    //       ? forkJoin(fileContentModels.map(fileContent => this.rdfService.loadExternalReferenceModelIntoStore(fileContent)))
    //       : of([] as Array<RdfModel>),
    //   ),
    //   tap(extRdfModel => {
    //     extRdfModel.forEach(extRdfModel => this.loadExternalAspectModel(extRdfModel.absoluteAspectModelFileName));
    //   }),
    // );
    return null;
  }

  // @todo see if this funcion is still relevant
  loadModels(): Observable<RdfModel[]> {
    // return this.modelApiService
    //   .getAllNamespacesFilesContent()
    //   .pipe(
    //     mergeMap((fileContentModels: FileContentModel[]) =>
    //       fileContentModels.length ? this.rdfService.parseModels(fileContentModels) : of([]),
    //     ),
    //   );
    return null;
  }

  // TODO see if is still relevant
  removeAspectModelFileFromStore(aspectModelFileName: string) {
    // const index = this.rdfService.externalRdfModels.findIndex(
    //   extRdfModel => extRdfModel.absoluteAspectModelFileName === aspectModelFileName,
    // );
    // this.rdfService.externalRdfModels.splice(index, 1);
  }

  generateJsonSample(rdfModel: RdfModel): Observable<string> {
    const serializedModel = this.rdfService.serializeModel(rdfModel);
    return this.modelApiService.generateJsonSample(serializedModel);
  }

  generateJsonSchema(rdfModel: RdfModel, language: string): Observable<string> {
    const serializedModel = this.rdfService.serializeModel(rdfModel);
    return this.modelApiService.generateJsonSchema(serializedModel, language);
  }

  generateOpenApiSpec(rdfModel: RdfModel, openApi: OpenApi): Observable<string> {
    const serializedModel = this.rdfService.serializeModel(rdfModel);
    return this.modelApiService.generateOpenApiSpec(serializedModel, openApi).pipe(
      catchError(err => {
        this.notificationsService.error({
          title: this.translate.language.GENERATE_OPENAPI_SPEC_DIALOG.RESOURCE_PATH_ERROR,
          message: err.error.message,
          timeout: 5000,
        });
        return throwError(() => err.error);
      }),
    );
  }

  generateAsyncApiSpec(rdfModel: RdfModel, asyncApi: AsyncApi): Observable<string> {
    const serializedModel = this.rdfService.serializeModel(rdfModel);
    return this.modelApiService.generateAsyncApiSpec(serializedModel, asyncApi);
  }

  private loadCurrentModel(loadedRdfModel: RdfModel, rdfAspectModel: string, namespaceFileName: string, editElementUrn?: string): void {
    const [namespace, version, fileName] = namespaceFileName.split(':');
    this.loadedFilesService.removeFile(`urn:samm:${namespace}:${version}: ${fileName}`);

    this.modelService
      .loadRdfModel(loadedRdfModel, rdfAspectModel, namespaceFileName)
      .pipe(
        first(),
        tap((aspect: Aspect) => {
          this.removeOldGraph();
          this.initializeNewGraph(editElementUrn);
          this.titleService.updateTitle(namespaceFileName || aspect?.aspectModelUrn);
        }),
        catchError(error => {
          console.error('Error on loading aspect model', error);
          this.notificationsService.error({title: 'Error on loading the aspect model', message: error});
          // TODO: Use 'null' instead of empty object (requires thorough testing)
          return of({} as null);
        }),
      )
      .subscribe();
  }

  private removeOldGraph() {
    this.mxGraphService.deleteAllShapes();
  }

  private initializeNewGraph(editElementUrn?: string): void {
    try {
      const rdfModel = this.modelService.currentRdfModel;
      const mxGraphRenderer = new MxGraphRenderer(this.mxGraphService, this.mxGraphShapeOverlayService, this.sammLangService, rdfModel);

      const elements = this.currentLoadedFile.cachedFile.getKeys().map(key => this.currentLoadedFile.cachedFile.get<NamedElement>(key));
      this.prepareGraphUpdate(mxGraphRenderer, elements, editElementUrn);
    } catch (error) {
      console.groupCollapsed('editor.service', error);
      console.groupEnd();
      throwError(() => error);
    }
  }

  private prepareGraphUpdate(mxGraphRenderer: MxGraphRenderer, elements: NamedElement[], editElementUrn?: string): void {
    this.largeFileWarningService
      .openDialog(elements.length)
      .pipe(
        first(),
        filter(response => response !== 'cancel'),
        tap(() => this.toggleLoadingScreen()),
        delay(500), // Wait for modal animation
        switchMap(() => this.graphUpdateWorkflow(mxGraphRenderer, elements)),
      )
      .subscribe({
        next: () => this.finalizeGraphUpdate(editElementUrn),
        error: () => this.loadingScreenService.close(),
      });
  }

  private toggleLoadingScreen(): void {
    this.loadingScreenService.close();
    requestAnimationFrame(() => {
      this.loadingScreenService.open({title: this.translate.language.LOADING_SCREEN_DIALOG.MODEL_GENERATION});
    });
  }

  private graphUpdateWorkflow(mxGraphRenderer: MxGraphRenderer, elements: NamedElement[]): Observable<boolean> {
    return this.mxGraphService.updateGraph(() => {
      this.mxGraphService.firstTimeFold = true;
      MxGraphHelper.filterMode = this.filtersService.currentFilter.filterType;
      const rootElements = elements.filter(e => !e.parents.length);
      const filtered = this.filtersService.filter(rootElements);

      for (const elementTree of filtered) {
        mxGraphRenderer.render(elementTree, null);
      }

      if (this.mxGraphAttributeService.inCollapsedMode) {
        this.mxGraphService.foldCells();
      }
    });
  }

  private finalizeGraphUpdate(editElementUrn?: string): void {
    this.mxGraphService.formatShapes(true);
    this.handleEditOrCenterView(editElementUrn);
    localStorage.removeItem(ValidateStatus.validating);
    this.loadingScreenService.close();
  }

  private handleEditOrCenterView(editElementUrn: string | null): void {
    if (editElementUrn) {
      this.shapeSettingsService.editModelByUrn(editElementUrn);
      this.mxGraphService.navigateToCellByUrn(editElementUrn);
    } else {
      this.mxGraphSetupService.centerGraph();
    }
  }

  makeDraggable(element: HTMLDivElement, dragElement: HTMLDivElement) {
    const ds = mxUtils.makeDraggable(
      element,
      this.mxGraphAttributeService.graph,
      (_graph, _evt, _cell, x, y) => {
        const elementType: string = element.dataset.type;
        const urn: string = element.dataset.urn;
        this.ngZone.run(() => this.createElement(x, y, elementType, urn));
      },
      dragElement,
    );
    ds.setGuidesEnabled(true);
  }

  createElement(x: number, y: number, elementType: string, aspectModelUrn?: string) {
    // in case of new element (no urn passed)
    if (!aspectModelUrn) {
      let newInstance = null;
      switch (elementType) {
        case 'aspect':
          if (this.currentLoadedFile.aspect) {
            this.notificationsService.warning({title: 'An AspectModel can contain only one Aspect element.'});
            return;
          }
          newInstance = createEmptyElement(DefaultAspect);
          break;
        default:
          newInstance = createEmptyElement(sammElements[elementType].class, elementType.includes('abstract'));
      }

      if (newInstance instanceof DefaultAspect) {
        this.createAspect(newInstance, {x, y});
        return;
      }

      const metaModelElement = this.modelElementNamingService.resolveMetaModelElement(newInstance);
      metaModelElement
        ? this.mxGraphService.renderModelElement(this.filtersService.createNode(metaModelElement), {
            shapeAttributes: [],
            geometry: {x, y},
          })
        : this.openAlertBox();

      if (metaModelElement instanceof NamedElement) {
        this.currentLoadedFile.cachedFile.resolveInstance(metaModelElement);
      }
    } else {
      const element: NamedElement = this.loadedFilesService.findElementOnExtReferences(aspectModelUrn);
      if (!this.mxGraphService.resolveCellByModelElement(element)) {
        const renderer = new MxGraphRenderer(this.mxGraphService, this.mxGraphShapeOverlayService, this.sammLangService, null);

        this.mxGraphService.setCoordinatesForNextCellRender(x, y);

        const filteredElements = this.filtersService.filter([element]);
        const cell = renderer.render(filteredElements[0], null);

        this.mxGraphService.formatCell(cell);
      } else {
        this.notificationsService.warning({
          title: 'Element is already used',
          link: `editor/select/${aspectModelUrn}`,
          timeout: 2000,
        });
      }
    }
  }

  private createAspect(aspectInstance: DefaultAspect, geometry: ShapeConfiguration['geometry']) {
    this.confirmDialogService
      .open({
        phrases: [
          this.translate.language.CONFIRM_DIALOG.CREATE_ASPECT.ASPECT_CREATION_WARNING,
          this.translate.language.CONFIRM_DIALOG.CREATE_ASPECT.NAME_REPLACEMENT_NOTICE,
        ],
        title: this.translate.language.CONFIRM_DIALOG.CREATE_ASPECT.TITLE,
        closeButtonText: this.translate.language.CONFIRM_DIALOG.CREATE_ASPECT.CLOSE_BUTTON,
        okButtonText: this.translate.language.CONFIRM_DIALOG.CREATE_ASPECT.OK_BUTTON,
      })
      .subscribe(confirm => {
        if (confirm === ConfirmDialogEnum.cancel) {
          return;
        }

        const metaModelElement = this.modelElementNamingService.resolveMetaModelElement(aspectInstance);
        this.loadedFilesService.updateFileNaming(this.currentLoadedFile, {aspect: metaModelElement, name: `${metaModelElement.name}.ttl`});

        metaModelElement
          ? this.mxGraphService.renderModelElement(this.filtersService.createNode(aspectInstance), {
              shapeAttributes: [],
              geometry,
            })
          : this.openAlertBox();
        this.titleService.updateTitle(this.currentLoadedFile.absoluteName);
      });
  }

  deleteSelectedElements() {
    const result = [];
    const selectedCells = this.mxGraphShapeSelectorService.getSelectedCells();

    result.push(...selectedCells);

    this.deleteElements(result);

    if (result.some((cell: mxgraph.mxCell) => MxGraphHelper.getModelElement(cell)?.isExternalReference())) {
      result.forEach((element: any) => {
        this.deletePrefixForExternalNamespaceReference(element);
      });
    }
  }

  private deletePrefixForExternalNamespaceReference(element: any) {
    const rdfModel = this.modelService.currentRdfModel;

    const aspectModelUrnToBeRemoved = MxGraphHelper.getModelElement(element).aspectModelUrn;
    const urnToBeChecked = aspectModelUrnToBeRemoved.substring(0, aspectModelUrnToBeRemoved.indexOf('#'));

    const nodeNames = rdfModel.store.getObjects(null, null, null).map((el: any) => el.id);
    const nodesWithoutDeletedElement = nodeNames.filter(el => el !== aspectModelUrnToBeRemoved);

    // it is checked if other elements from the external namespace are in the model
    if (!nodesWithoutDeletedElement.some(el => el.includes(urnToBeChecked))) {
      const prefixes = rdfModel.getPrefixes();
      const prefixesArray = this.convertArraysToArray(Object.entries(prefixes));

      const externalPrefixToBeDeleted = prefixesArray.filter(el => el.value === `${urnToBeChecked}#`);
      if (externalPrefixToBeDeleted && externalPrefixToBeDeleted.length > 0) {
        rdfModel.removePrefix(externalPrefixToBeDeleted[0].name);
      }
    }
  }

  private convertArraysToArray(inputArray: any) {
    const resultArray = [];

    for (const pair of inputArray) {
      if (Array.isArray(pair) && pair.length === 2) {
        const [name, value] = pair;
        resultArray.push({name, value});
      }
    }
    return resultArray;
  }

  private deleteElements(cells: mxgraph.mxCell[]): void {
    if (this.shapeSettingsStateService.isShapeSettingOpened && cells.includes(this.shapeSettingsStateService.selectedShapeForUpdate)) {
      this.shapeSettingsStateService.closeShapeSettings();
    }

    cells.forEach((cell: mxgraph.mxCell) => {
      this.mxGraphAttributeService.graph.setCellStyles(
        mxConstants.STYLE_STROKECOLOR,
        'black',
        this.mxGraphService.graph.getOutgoingEdges(cell).map(edge => edge.target),
      );
      this.elementModelService.deleteElement(cell);
    });
  }

  zoomIn() {
    this.loadingScreenService
      .open({
        title: this.translate.language.LOADING_SCREEN_DIALOG.ZOOM_IN_PROGRESS,
        content: this.translate.language.LOADING_SCREEN_DIALOG.ZOOM_IN_WAIT,
      })
      .afterOpened()
      .subscribe(() => {
        this.mxGraphAttributeService.graph.zoomIn();
        this.loadingScreenService.close();
      });
  }

  zoomOut() {
    this.loadingScreenService
      .open({
        title: this.translate.language.LOADING_SCREEN_DIALOG.ZOOM_OUT_PROGRESS,
        content: this.translate.language.LOADING_SCREEN_DIALOG.ZOOM_IN_WAIT,
      })
      .afterOpened()
      .subscribe(() => {
        this.mxGraphAttributeService.graph.zoomOut();
        this.loadingScreenService.close();
      });
  }

  fit() {
    this.loadingScreenService
      .open({
        title: this.translate.language.LOADING_SCREEN_DIALOG.FITTING_PROGRESS,
        content: this.translate.language.LOADING_SCREEN_DIALOG.FITTING_WAIT,
      })
      .afterOpened()
      .subscribe(() => {
        this.mxGraphAttributeService.graph.fit();
        this.loadingScreenService.close();
      });
  }

  actualSize() {
    this.loadingScreenService
      .open({
        title: this.translate.language.LOADING_SCREEN_DIALOG.FIT_TO_VIEW_PROGRESS,
        content: this.translate.language.LOADING_SCREEN_DIALOG.FITTING_WAIT,
      })
      .afterOpened()
      .subscribe(() => {
        this.mxGraphAttributeService.graph.zoomActual();
        this.loadingScreenService.close();
      });
  }

  toggleExpand() {
    const isExpanded = this.isAllShapesExpandedSubject.getValue();
    this.loadingScreenService
      .open({
        title: isExpanded ? this.translate.language.LOADING_SCREEN_DIALOG.FOLDING : this.translate.language.LOADING_SCREEN_DIALOG.EXPANDING,
        content: this.translate.language.LOADING_SCREEN_DIALOG.ACTION_WAIT,
      })
      .afterOpened()
      .pipe(switchMap(() => (isExpanded ? this.mxGraphService.foldCells() : this.mxGraphService.expandCells())))
      .subscribe(() => {
        this.isAllShapesExpandedSubject.next(!isExpanded);
        this.mxGraphService.formatShapes(true);
        this.loadingScreenService.close();
      });
  }

  formatModel() {
    this.loadingScreenService
      .open({
        title: this.translate.language.LOADING_SCREEN_DIALOG.FORMATTING,
        content: this.translate.language.LOADING_SCREEN_DIALOG.WAIT_FORMAT,
      })
      .afterOpened()
      .subscribe(() => {
        this.mxGraphService.formatShapes(true, true);
        this.loadingScreenService.close();
      });
  }

  enableAutoValidation() {
    this.settings.autoValidationEnabled ? this.startValidateModel() : this.stopValidateModel();
  }

  startValidateModel() {
    this.stopValidateModel();
    localStorage.removeItem(ValidateStatus.validating);
    this.validateModelSubscription$ = this.autoValidateModel().subscribe();
  }

  stopValidateModel() {
    localStorage.removeItem(ValidateStatus.validating);
    if (this.validateModelSubscription$) {
      this.validateModelSubscription$.unsubscribe();
    }
  }

  autoValidateModel(): Observable<ViolationError[]> {
    return of({}).pipe(
      delayWhen(() => timer(this.settings.validationTimerSeconds * 1000)),
      switchMap(() => (this.currentLoadedFile.cachedFile.getKeys().length ? this.validate().pipe(first()) : of([]))),
      tap(() => localStorage.removeItem(ValidateStatus.validating)),
      tap(() => this.enableAutoValidation()),
      retry({
        delay: error => {
          if (!Object.values(SaveValidateErrorsCodes).includes(error?.type)) {
            console.error(`Error occurred while validating the current model (${error})`);
            this.notificationsService.error({
              title: this.translate.language.NOTIFICATION_SERVICE.VALIDATION_ERROR_TITLE,
              message: this.translate.language.NOTIFICATION_SERVICE.VALIDATION_ERROR_MESSAGE,
              timeout: 5000,
            });
          }
          localStorage.removeItem(ValidateStatus.validating);

          return timer(this.settings.validationTimerSeconds * 1000);
        },
      }),
    );
  }

  validate(): Observable<Array<ViolationError>> {
    this.mxGraphService.resetValidationErrorOnAllShapes();

    return this.modelService.synchronizeModelToRdf().pipe(
      switchMap(value =>
        localStorage.getItem(ValidateStatus.validating)
          ? throwError(() => ({type: SaveValidateErrorsCodes.validationInProgress}))
          : of(value),
      ),
      switchMap(() => {
        localStorage.setItem(ValidateStatus.validating, 'yes');
        const rdfModel = this.modelService.currentRdfModel;
        return rdfModel
          ? this.modelApiService.validate(this.rdfService.serializeModel(rdfModel))
          : throwError(() => ({type: SaveValidateErrorsCodes.emptyModel}));
      }),
    );
  }

  enableAutoSave(): void {
    this.settings.autoSaveEnabled ? this.startSaveModel() : this.stopSaveModel();
  }

  startSaveModel(): void {
    this.stopSaveModel();
    this.saveModelSubscription$ = this.autoSaveModel().subscribe();
  }

  stopSaveModel() {
    if (this.saveModelSubscription$) {
      this.saveModelSubscription$.unsubscribe();
    }
  }

  autoSaveModel(): Observable<RdfModel | object> {
    return of({}).pipe(
      delayWhen(() => timer(this.settings.saveTimerSeconds * 1000)),
      switchMap(() =>
        this.currentLoadedFile.cachedFile.getKeys().length && !this.currentLoadedFile.name.includes('empty.ttl')
          ? this.saveModel().pipe(first())
          : of([]),
      ),
      tap(() => this.enableAutoSave()),
      retry({
        delay: () => timer(this.settings.saveTimerSeconds * 1000),
      }),
    );
  }

  saveModel(): Observable<RdfModel | object> {
    return this.modelService.saveModel().pipe(
      tap(() => {
        this.modelSavingTracker.updateSavedModel();
        this.notificationsService.info({title: this.translate.language.NOTIFICATION_SERVICE.ASPECT_SAVED_SUCCESS});
        console.info('Aspect model was saved to the local folder');
        this.sidebarService.workspace.refresh();
      }),
      catchError(error => {
        // TODO Should be refined
        console.groupCollapsed('editor-service -> saveModel', error);
        console.groupEnd();

        console.error('Error on saving aspect model', error);
        this.notificationsService.error({title: this.translate.language.NOTIFICATION_SERVICE.ASPECT_SAVED_ERROR});
        return of({});
      }),
    );
  }

  getSerializedModel(): string {
    return this.rdfService.serializeModel(this.modelService.currentRdfModel);
  }

  openAlertBox() {
    this.alertService.open({
      data: {
        title: this.translate.language.NOTIFICATION_SERVICE.ASPECT_MISSING_TITLE,
        content: this.translate.language.NOTIFICATION_SERVICE.ASPECT_MISSING_CONTENT,
      },
    });
  }
}
