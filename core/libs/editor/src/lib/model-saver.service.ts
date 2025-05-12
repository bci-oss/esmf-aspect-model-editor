import {ModelApiService} from '@ame/api';
import {LoadedFilesService, NamespaceFile} from '@ame/cache';
import {ModelService, RdfSerializerService} from '@ame/rdf/services';
import {ConfigurationService} from '@ame/settings-dialog';
import {ModelSavingTrackerService, NotificationsService, SaveValidateErrorsCodes} from '@ame/shared';
import {SidebarStateService} from '@ame/sidebar';
import {LanguageTranslationService} from '@ame/translation';
import {Injectable, inject} from '@angular/core';
import {RdfModel} from '@esmf/aspect-model-loader';
import {Observable, Subscription, catchError, delayWhen, first, map, of, retry, switchMap, tap, throwError, timer} from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class ModelSaverService {
  private modelApiService = inject(ModelApiService);
  private rdfSerializer = inject(RdfSerializerService);
  private loadedFiles = inject(LoadedFilesService);
  private modelService = inject(ModelService);
  private modelSavingTracker = inject(ModelSavingTrackerService);
  private notificationsService = inject(NotificationsService);
  private sidebarService = inject(SidebarStateService);
  private translate = inject(LanguageTranslationService);
  private configurationService = inject(ConfigurationService);

  private saveModelSubscription$: Subscription;

  private get settings() {
    return this.configurationService.getSettings();
  }

  private get currentFile(): NamespaceFile | undefined {
    return this.loadedFiles.currentLoadedFile;
  }

  saveModel() {
    const synchronizedModel = this.modelService.synchronizeModelToRdf();
    return (synchronizedModel || throwError(() => ({type: SaveValidateErrorsCodes.desynchronized}))).pipe(
      switchMap(() => this.writeModelToWorkspace()),
      tap(() => {
        this.modelSavingTracker.updateSavedModel();
        this.notificationsService.info({title: this.translate.language.NOTIFICATION_SERVICE.ASPECT_SAVED_SUCCESS});
        console.info('Aspect model was saved to the local folder');
        this.sidebarService.workspace.refresh();
      }),
      catchError(error => {
        console.error('Error on saving aspect model', error);
        this.notificationsService.error({title: this.translate.language.NOTIFICATION_SERVICE.ASPECT_SAVED_ERROR});
        return of({});
      }),
    );
  }

  autoSaveModel(): Observable<RdfModel | object> {
    return of({}).pipe(
      delayWhen(() => timer(this.settings.saveTimerSeconds * 1000)),
      switchMap(() =>
        this.currentFile.cachedFile.getKeys().length && !this.currentFile.name.includes('empty.ttl')
          ? this.saveModel().pipe(first())
          : of([]),
      ),
      tap(() => this.enableAutoSave()),
      retry({
        delay: () => timer(this.settings.saveTimerSeconds * 1000),
      }),
    );
  }

  enableAutoSave(): void {
    this.settings.autoSaveEnabled ? this.startSaveModel() : this.stopSaveModel();
  }

  private startSaveModel(): void {
    this.stopSaveModel();
    this.saveModelSubscription$ = this.autoSaveModel().subscribe();
  }

  private stopSaveModel() {
    if (this.saveModelSubscription$) {
      this.saveModelSubscription$.unsubscribe();
    }
  }

  private writeModelToWorkspace(): Observable<RdfModel> {
    const rdfContent = this.rdfSerializer.serializeModel(this.currentFile?.rdfModel);

    if (!rdfContent) {
      console.info('Model is empty. Skipping saving.');
      return throwError(() => ({code: SaveValidateErrorsCodes.emptyModel}));
    }

    return this.modelApiService.formatModel(rdfContent).pipe(
      switchMap(content => {
        if (!content) {
          return throwError(() => ({code: SaveValidateErrorsCodes.emptyModel}));
        }

        return this.modelApiService.saveModel(content, this.currentFile?.absoluteName || '');
      }),
      map(() => this.currentFile?.rdfModel),
    );
  }
}
