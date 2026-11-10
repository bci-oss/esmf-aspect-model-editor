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

import {AI_ATTACHMENT_EXTENSIONS, AiContextItem, AiOpenModel} from '@ame/domain';
import {ChangeDetectionStrategy, Component, ElementRef, input, output, viewChild} from '@angular/core';
import {MatIconModule} from '@angular/material/icon';
import {MatMenuModule} from '@angular/material/menu';
import {MatProgressSpinner} from '@angular/material/progress-spinner';
import {MatTooltip} from '@angular/material/tooltip';
import {TranslocoDirective} from '@jsverse/transloco';
import {aiContextIcon} from '../../utils';

type Translate = (key: string, params?: Record<string, unknown>) => string;

/** The file types offered by the file dialog. */
export const AI_ATTACHMENT_ACCEPT = AI_ATTACHMENT_EXTENSIONS.map(extension => '.' + extension).join(',');

/**
 * What is sent with the next message: the open model, the selected element and the added elements, errors, files and models.
 * The button in front adds files of the computer or models of the workspace.
 */
@Component({
  selector: 'ame-ai-context-chips',
  templateUrl: './ai-context-chips.component.html',
  styleUrls: ['./ai-context-chips.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatIconModule, MatMenuModule, MatProgressSpinner, MatTooltip, TranslocoDirective],
})
export class AiContextChipsComponent {
  readonly openModel = input<AiOpenModel | null>(null);
  readonly includeModel = input(true);
  /** Name of the selected element that is part of the context. */
  readonly selectedElement = input<string | null>(null);
  readonly items = input<AiContextItem[]>([]);
  readonly disabled = input(false);

  readonly includeModelChange = output<boolean>();
  readonly selectionExcluded = output<void>();
  readonly itemRemoved = output<string>();
  readonly filesAttached = output<File[]>();
  /** The user wants to choose models of the workspace. */
  readonly pickerRequested = output<void>();

  private readonly fileInput = viewChild<ElementRef<HTMLInputElement>>('fileInput');

  readonly accept = AI_ATTACHMENT_ACCEPT;

  openFileDialog(): void {
    this.fileInput()?.nativeElement.click();
  }

  onFilesChosen(event: Event): void {
    const target = event.target as HTMLInputElement;
    const files = Array.from(target.files ?? []);
    // the same file can be chosen again
    target.value = '';
    if (files.length && !this.disabled()) this.filesAttached.emit(files);
  }

  icon(item: AiContextItem): string {
    return aiContextIcon(item.kind, {sourceType: item.sourceType, fileKind: item.attachment?.kind, fileName: item.label});
  }

  /** Details of an item, e.g. the pages and characters of a file or the namespace of a model. */
  tooltip(item: AiContextItem, t: Translate): string {
    switch (item.kind) {
      case 'error':
        return item.error?.message ?? '';
      case 'element':
        return item.urn ?? '';
      case 'file':
        return this.fileTooltip(item, t);
      default:
        return [item.label, item.detail].filter(Boolean).join('\n');
    }
  }

  private fileTooltip(item: AiContextItem, t: Translate): string {
    if (item.uploading || !item.attachment) return [item.label, t('ai.context.file.uploading')].join('\n');
    const attachment = item.attachment;
    return [
      attachment.name,
      attachment.pages ? t('ai.context.file.pages', {count: attachment.pages}) : '',
      t('ai.context.file.characters', {count: attachment.characters}),
      attachment.truncated ? t('ai.context.file.truncated') : '',
      attachment.warning === 'no_text' ? t('ai.context.file.no_text') : '',
    ]
      .filter(Boolean)
      .join('\n');
  }
}
