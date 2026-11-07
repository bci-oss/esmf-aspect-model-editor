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

import {JavaClassesOptions, LoadedFilesService, ModelApiPort} from '@ame/domain';
import {DialogCloseButtonComponent, LanguageTranslationService, NotificationsService} from '@ame/shared';
import {Component, DestroyRef, inject, signal} from '@angular/core';
import {takeUntilDestroyed} from '@angular/core/rxjs-interop';
import {form, FormField, pattern} from '@angular/forms/signals';
import {MatButtonModule} from '@angular/material/button';
import {MatCheckboxModule} from '@angular/material/checkbox';
import {MatDialogModule, MatDialogRef} from '@angular/material/dialog';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {MatProgressSpinnerModule} from '@angular/material/progress-spinner';
import {MatTooltipModule} from '@angular/material/tooltip';
import {TranslocoDirective} from '@jsverse/transloco';
import {saveAs} from 'file-saver';
import {finalize, first} from 'rxjs/operators';
import {EditorService} from '../../../editor.service';

/** Dot-separated Java identifiers, as checked by the backend; empty means "derive from the namespace". */
export const JAVA_PACKAGE_PATTERN = /^$|^[a-zA-Z_$][\w$]*(\.[a-zA-Z_$][\w$]*)*$/;

@Component({
  selector: 'ame-generate-java',
  templateUrl: './generate-java.component.html',
  styleUrls: ['./generate-java.component.scss'],
  imports: [
    DialogCloseButtonComponent,
    MatDialogModule,
    TranslocoDirective,
    MatFormFieldModule,
    MatInputModule,
    MatCheckboxModule,
    MatTooltipModule,
    MatProgressSpinnerModule,
    FormField,
    MatButtonModule,
  ],
})
export class GenerateJavaComponent {
  private destroyRef = inject(DestroyRef);
  private dialogRef = inject(MatDialogRef<GenerateJavaComponent>);
  private modelApiService = inject(ModelApiPort);
  private editorService = inject(EditorService);
  private loadedFiles = inject(LoadedFilesService);
  private notificationsService = inject(NotificationsService);
  private translate = inject(LanguageTranslationService);

  public javaModel = signal<JavaClassesOptions>({packageName: '', staticMetaModel: false, jacksonAnnotations: true});
  public javaForm = form(this.javaModel, schemaPath => {
    pattern(schemaPath.packageName, JAVA_PACKAGE_PATTERN);
  });
  /** Shown as placeholder: the package the backend derives from the namespace if none is entered. */
  public readonly defaultPackageName = this.derivePackageName(this.loadedFiles.currentLoadedFile?.aspect?.aspectModelUrn);
  public isGenerating = signal(false);

  downloadJavaClasses(): void {
    const currentFile = this.loadedFiles.currentLoadedFile;
    const options = {...this.javaModel(), packageName: this.javaModel().packageName.trim()};
    this.isGenerating.set(true);

    this.modelApiService
      .generateJavaClasses(this.editorService.getSerializedModel(), options, currentFile?.rdfModel.getSourceLocation())
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        first(),
        finalize(() => this.isGenerating.set(false)),
      )
      .subscribe({
        next: archive => {
          saveAs(archive, `${currentFile?.aspect?.name ?? 'aspect'}-java.zip`);
          this.dialogRef.close();
        },
        error: () =>
          this.notificationsService.error({
            title: this.translate.translateService.translate('generateJavaDialog.failed'),
            timeout: 5000,
          }),
      });
  }

  private derivePackageName(aspectModelUrn?: string): string {
    const namespace = aspectModelUrn?.split(':')[2] ?? '';
    return namespace.replace(/[^\w.$]/g, '_');
  }
}
