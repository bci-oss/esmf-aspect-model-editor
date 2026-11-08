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

import {LoadedFilesService, ModelService, SammLanguageSettingsService, SqlDialect} from '@ame/domain';
import {FileSaverService, LanguageTranslationService, LoadingScreenOptions, LoadingScreenService, NotificationsService} from '@ame/shared';
import {DestroyRef, inject, Injectable} from '@angular/core';
import {takeUntilDestroyed} from '@angular/core/rxjs-interop';
import {MatDialog, MatDialogRef} from '@angular/material/dialog';
import {environment} from 'environments/environment';
import {catchError, map, Observable, throwError} from 'rxjs';
import {filter, finalize, first, switchMap, tap} from 'rxjs/operators';
import {EditorService} from '../../editor.service';
import {PreviewDialogComponent, PreviewDialogOptions} from '../../preview-dialog';
import {AASXGenerationModalComponent} from '../components/aasx-generation-modal/aasx-generation-modal.component';
import {GenerateAsyncApiComponent} from '../components/generate-async-api/generate-async-api.component';
import {GenerateDiagramComponent} from '../components/generate-diagram/generate-diagram.component';
import {GenerateDocumentationComponent} from '../components/generate-documentation/generate-documentation.component';
import {GenerateJavaComponent} from '../components/generate-java/generate-java.component';
import {GenerateOpenApiComponent} from '../components/generate-open-api/generate-open-api.component';
import {GenerateSqlComponent} from '../components/generate-sql/generate-sql.component';
import {FileHandlingService} from './file-handling.service';

@Injectable({providedIn: 'root'})
export class GenerateHandlingService {
  private destroyRef = inject(DestroyRef);
  private fileSaver = inject(FileSaverService);
  private matDialog = inject(MatDialog);
  private editorService = inject(EditorService);
  private modelService = inject(ModelService);
  private notificationsService = inject(NotificationsService);
  private loadingScreenService = inject(LoadingScreenService);
  private translate = inject(LanguageTranslationService);
  private fileHandlingService = inject(FileHandlingService);
  private loadedFilesService = inject(LoadedFilesService);
  private sammLanguageSettingsService = inject(SammLanguageSettingsService);

  private get currentFile() {
    return this.loadedFilesService.currentLoadedFile;
  }

  constructor() {
    if (!environment.production) {
      window['angular.generateHandlingService'] = this;
    }
  }

  onGenerateOpenApiSpec() {
    const cb = () => this.openGenerationOpenApiSpec();
    this.validateFile(cb);
  }

  openGenerationOpenApiSpec(): MatDialogRef<GenerateOpenApiComponent> {
    return this.matDialog.open(GenerateOpenApiComponent, {disableClose: true});
  }

  onGenerateAsyncApiSpec() {
    const cb = () => this.openGenerationAsyncApiSpec();
    this.validateFile(cb);
  }

  openGenerationAsyncApiSpec(): MatDialogRef<GenerateAsyncApiComponent> {
    return this.matDialog.open(GenerateAsyncApiComponent, {disableClose: true});
  }

  onGenerateDocumentation() {
    const cb = () => this.openGenerationDocumentation();
    this.validateFile(cb);
  }

  openGenerationDocumentation(): MatDialogRef<GenerateDocumentationComponent> {
    return this.matDialog.open(GenerateDocumentationComponent, {disableClose: true});
  }

  onGenerateAASXFile() {
    const cb = () => this.openGenerationAASX();
    this.validateFile(cb);
  }

  openGenerationAASX(): MatDialogRef<AASXGenerationModalComponent> {
    return this.matDialog.open(AASXGenerationModalComponent, {disableClose: true});
  }

  onGenerateDiagram() {
    const cb = () => this.openGenerationDiagram();
    this.validateFile(cb);
  }

  openGenerationDiagram(): MatDialogRef<GenerateDiagramComponent> {
    return this.matDialog.open(GenerateDiagramComponent, {disableClose: true});
  }

  onGenerateSql() {
    const cb = () => this.generateSql().pipe(takeUntilDestroyed(this.destroyRef), first()).subscribe();
    this.validateFile(cb);
  }

  /** Asks for the SQL dialect, then previews the table definition with a switch for the language of its comments. */
  generateSql(): Observable<void> {
    return this.matDialog
      .open<GenerateSqlComponent, void, SqlDialect>(GenerateSqlComponent)
      .afterClosed()
      .pipe(
        filter((dialect): dialect is SqlDialect => !!dialect),
        switchMap(dialect => {
          const languages = this.sammLanguageSettingsService.getSammLanguageCodes();
          const language = this.defaultSchemaLanguage(languages);
          const regenerate = (lang: string) => this.requestSql(lang, dialect);

          return this.withLoadingScreen(this.translate.language.notificationDialog?.generateSql, regenerate(language)).pipe(
            map(content =>
              this.openPreview(this.translate.language.generateHandling.sqlPreview, content, this.fileNameWithSuffix('.sql'), {
                languages,
                language,
                regenerate,
                languageHint: this.translate.language.generateHandling.sqlLanguageHint,
                mimeType: 'application/sql;charset=utf-8',
              }),
            ),
          );
        }),
        map(() => undefined),
      );
  }

  onGenerateJsonLd() {
    const cb = () => this.generateJsonLd().pipe(takeUntilDestroyed(this.destroyRef), first()).subscribe();
    this.validateFile(cb);
  }

  /** Previews the Aspect Model as JSON-LD; it contains all languages, so there is nothing to choose. */
  generateJsonLd(): Observable<void> {
    const request = this.editorService.generateJsonLd(this.currentFile?.rdfModel).pipe(
      first(),
      catchError(() => this.failGeneration(this.translate.language.generateHandling.failGenerateJsonLd)),
    );

    return this.withLoadingScreen(this.translate.language.notificationDialog?.generateJsonLd, request).pipe(
      map(content => {
        this.openPreview(this.translate.language.generateHandling.jsonLdPreview, content, this.fileNameWithSuffix('.jsonld'), {
          mimeType: 'application/ld+json;charset=utf-8',
        });
      }),
    );
  }

  onGenerateJavaClasses() {
    const cb = () => this.openGenerationJavaClasses();
    this.validateFile(cb);
  }

  openGenerationJavaClasses(): MatDialogRef<GenerateJavaComponent> {
    return this.matDialog.open(GenerateJavaComponent, {disableClose: true});
  }

  onGenerateParquetPayload() {
    const cb = () => this.generateParquetPayload().pipe(takeUntilDestroyed(this.destroyRef), first()).subscribe();
    this.validateFile(cb);
  }

  /** Downloads a sample payload in the binary Apache Parquet format; there is nothing to preview or choose. */
  generateParquetPayload(): Observable<void> {
    const request = this.editorService.generateParquetPayload(this.currentFile?.rdfModel).pipe(
      first(),
      catchError(() => this.failGeneration(this.translate.language.generateHandling.failGenerateParquetPayload)),
    );

    return this.withLoadingScreen(this.translate.language.notificationDialog?.generateParquetPayload, request).pipe(
      map(payload => this.fileSaver.download(payload, this.fileNameWithSuffix('-sample.parquet'))),
    );
  }

  onGenerateJsonSample() {
    const cb = () => this.generateJsonSample().pipe(takeUntilDestroyed(this.destroyRef), first()).subscribe();
    this.validateFile(cb);
  }

  generateJsonSample(): Observable<any> {
    const loadingScreenOptions: LoadingScreenOptions = {
      title: this.translate.language.notificationDialog?.generateJsonPayload,
      content: this.translate.language.notificationDialog?.content,
      hasCloseButton: true,
    };

    this.loadingScreenService.open(loadingScreenOptions);
    return this.editorService.generateJsonSample(this.loadedFilesService.currentLoadedFile?.rdfModel).pipe(
      first(),
      catchError(() => {
        this.notificationsService.error({
          title: this.translate.language.generateHandling.failGenerateJsonSample,
          message: this.translate.language.generateHandling.invalidModel,
          timeout: 5000,
        });
        return throwError(() => this.translate.language.generateHandling.failGenerateJsonSample);
      }),
      map(data => {
        this.openPreview(
          this.translate.language.generateHandling.jsonPayloadPreview,
          this.formatStringToJson(data),
          !this.loadedFilesService?.currentLoadedFile?.aspect
            ? this.currentFile.name
            : `${this.loadedFilesService?.currentLoadedFile?.aspect.name}-sample.json`,
        );
      }),
      finalize(() => this.loadingScreenService.close()),
    );
  }

  onGenerateJsonSchema() {
    const cb = () => this.generateJsonSchema().pipe(takeUntilDestroyed(this.destroyRef), first()).subscribe();
    this.validateFile(cb);
  }

  /**
   * Generates the JSON Schema and shows it in the preview. The language only selects the language of the
   * `description` texts inside the schema, so it is not asked for upfront: the schema is generated in the
   * best matching model language and the preview offers a switch if the model has more than one language.
   */
  generateJsonSchema(): Observable<void> {
    const loadingScreenOptions: LoadingScreenOptions = {
      title: this.translate.language.notificationDialog?.generateJsonSchema,
      content: this.translate.language.notificationDialog?.content,
      hasCloseButton: true,
    };
    const languages = this.sammLanguageSettingsService.getSammLanguageCodes();
    const language = this.defaultSchemaLanguage(languages);

    this.loadingScreenService.open(loadingScreenOptions);
    return this.requestJsonSchema(language).pipe(
      finalize(() => this.loadingScreenService.close()),
      map(content => {
        this.loadingScreenService.close();
        this.openPreview(this.translate.language.generateHandling.jsonSchemaPreview, content, this.fileNameWithSuffix('-schema.json'), {
          languages,
          language,
          regenerate: (lang: string) => this.requestJsonSchema(lang),
        });
      }),
    );
  }

  /** The UI language if the model has texts in it, otherwise English, otherwise the first model language. */
  private defaultSchemaLanguage(languages: string[]): string {
    const uiLanguage = this.translate.translateService?.getActiveLang?.();
    if (uiLanguage && languages.includes(uiLanguage)) return uiLanguage;
    if (languages.includes('en')) return 'en';
    return languages[0] ?? 'en';
  }

  private requestJsonSchema(language: string): Observable<string> {
    return this.editorService.generateJsonSchema(this.loadedFilesService.currentLoadedFile?.rdfModel, language).pipe(
      first(),
      catchError(() => {
        this.notificationsService.error({
          title: this.translate.language.generateHandling.failGenerateJsonSchema,
          message: this.translate.language.generateHandling.invalidModel,
          timeout: 5000,
        });
        return throwError(() => this.translate.language.generateHandling.failGenerateJsonSchema);
      }),
      map(data => this.formatStringToJson(data)),
    );
  }

  private requestSql(language: string, dialect: SqlDialect): Observable<string> {
    return this.editorService.generateSql(this.currentFile?.rdfModel, language, dialect).pipe(
      first(),
      catchError(() => this.failGeneration(this.translate.language.generateHandling.failGenerateSql)),
    );
  }

  private failGeneration(title: string): Observable<never> {
    this.notificationsService.error({title, message: this.translate.language.generateHandling.invalidModel, timeout: 5000});
    return throwError(() => title);
  }

  /** Shows the loading screen while the request runs and closes it as soon as the result arrives, before a preview opens. */
  private withLoadingScreen<T>(title: string, request: Observable<T>): Observable<T> {
    const close = () => this.loadingScreenService.close();
    this.loadingScreenService.open({title, content: this.translate.language.notificationDialog?.content, hasCloseButton: true});
    return request.pipe(tap({next: close}), finalize(close));
  }

  private fileNameWithSuffix(suffix: string): string {
    const aspect = this.loadedFilesService?.currentLoadedFile?.aspect;
    return aspect ? `${aspect.name}${suffix}` : this.currentFile.name;
  }

  // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
  validateFile(callback?: Function): void {
    this.modelService
      .synchronizeModelToRdf()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((): void => {
        if (!this.loadedFilesService?.currentLoadedFile?.aspect) {
          this.notificationsService.info({
            title: this.translate.language.generateHandling.noAspectTitle,
            timeout: 5000,
          });
          return;
        }
        this.fileHandlingService.validateFile(callback).pipe(takeUntilDestroyed(this.destroyRef), first()).subscribe();
      });
  }

  private formatStringToJson(data: string): string {
    return JSON.stringify(data, null, 2);
  }

  private openPreview(title: string, content: string, fileName: string, options: Partial<PreviewDialogOptions> = {}) {
    const config = {
      data: {
        ...options,
        title: title,
        content: content,
        fileName: fileName,
      } satisfies PreviewDialogOptions,
    };
    return this.matDialog.open(PreviewDialogComponent, config).afterClosed();
  }
}
