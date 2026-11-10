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

import {ChangeDetectionStrategy, Component, computed, inject, input, output, SecurityContext} from '@angular/core';
import {DomSanitizer} from '@angular/platform-browser';
import {renderMarkdown, urnOfLink} from '../../utils';

/** Shows Markdown of the assistant; element URNs in code spans are links that select the element. */
@Component({
  selector: 'ame-ai-markdown',
  templateUrl: './ai-markdown.component.html',
  styleUrls: ['./ai-markdown.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AiMarkdownComponent {
  private readonly sanitizer = inject(DomSanitizer);

  readonly text = input<string>('');
  readonly elementSelected = output<string>();

  readonly html = computed(() => this.sanitizer.sanitize(SecurityContext.HTML, renderMarkdown(this.text())) ?? '');

  onContentClick(event: MouseEvent): void {
    const urn = urnOfLink(event.target);
    if (!urn) return;
    event.preventDefault();
    this.elementSelected.emit(urn);
  }
}
