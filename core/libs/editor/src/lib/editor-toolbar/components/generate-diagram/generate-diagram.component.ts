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

import {DiagramFormat, LoadedFilesService, ModelApiPort, SammLanguageSettingsService} from '@ame/domain';
import {DialogCloseButtonComponent, LanguageTranslationService, NotificationsService} from '@ame/shared';
import {Component, DestroyRef, inject, signal} from '@angular/core';
import {takeUntilDestroyed} from '@angular/core/rxjs-interop';
import {form, FormField} from '@angular/forms/signals';
import {MatButtonModule} from '@angular/material/button';
import {MatOptionModule} from '@angular/material/core';
import {MatDialogModule, MatDialogRef} from '@angular/material/dialog';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatProgressSpinnerModule} from '@angular/material/progress-spinner';
import {MatSelectModule} from '@angular/material/select';
import {TranslocoDirective} from '@jsverse/transloco';
import {saveAs} from 'file-saver';
import * as locale from 'locale-codes';
import {finalize, first} from 'rxjs/operators';
import {EditorService} from '../../../editor.service';

export interface GenerateDiagramData {
  language: string;
  format: DiagramFormat;
}

export const DIAGRAM_FORMATS: readonly DiagramFormat[] = ['SVG', 'PNG'];

@Component({
  selector: 'ame-generate-diagram',
  templateUrl: './generate-diagram.component.html',
  styleUrls: ['./generate-diagram.component.scss'],
  imports: [
    DialogCloseButtonComponent,
    MatDialogModule,
    TranslocoDirective,
    MatFormFieldModule,
    MatSelectModule,
    MatOptionModule,
    MatProgressSpinnerModule,
    FormField,
    MatButtonModule,
  ],
})
export class GenerateDiagramComponent {
  private destroyRef = inject(DestroyRef);
  private dialogRef = inject(MatDialogRef<GenerateDiagramComponent>);
  private languageService = inject(SammLanguageSettingsService);
  private modelApiService = inject(ModelApiPort);
  private editorService = inject(EditorService);
  private loadedFiles = inject(LoadedFilesService);
  private notificationsService = inject(NotificationsService);
  private translate = inject(LanguageTranslationService);

  public readonly formats = DIAGRAM_FORMATS;
  public diagramModel = signal<GenerateDiagramData>({language: '', format: 'SVG'});
  public diagramForm = form(this.diagramModel);
  public languages = signal<locale.ILocale[]>([]);
  public isGenerating = signal(false);

  constructor() {
    const sammLanguages = this.languageService.getSammLanguageCodes().map(tag => locale.getByTag(tag));
    this.languages.set(sammLanguages);
    if (sammLanguages.length > 0) {
      this.diagramModel.update(model => ({...model, language: sammLanguages[0].tag}));
    }
  }

  downloadDiagram(): void {
    const {language, format} = this.diagramModel();
    const currentFile = this.loadedFiles.currentLoadedFile;
    this.isGenerating.set(true);

    this.modelApiService
      .generateDiagram(this.editorService.getSerializedModel(), language, format, currentFile?.rdfModel.getSourceLocation())
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        first(),
        finalize(() => this.isGenerating.set(false)),
      )
      .subscribe({
        next: diagram => {
          saveAs(diagram, `${currentFile?.aspect?.name ?? 'diagram'}.${format.toLowerCase()}`);
          this.dialogRef.close();
        },
        error: () =>
          this.notificationsService.error({
            title: this.translate.translateService.translate('generateDiagramDialog.failed'),
            timeout: 5000,
          }),
      });
  }
}
