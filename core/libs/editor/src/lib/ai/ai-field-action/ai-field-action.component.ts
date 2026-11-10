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

import {ChangeDetectionStrategy, Component, computed, inject, input} from '@angular/core';
import {MatIconButton} from '@angular/material/button';
import {MatIcon} from '@angular/material/icon';
import {MatMenu, MatMenuItem, MatMenuTrigger} from '@angular/material/menu';
import {MatTooltip} from '@angular/material/tooltip';
import {NamedElement} from '@esmf/aspect-model-loader';
import {TranslocoDirective} from '@jsverse/transloco';
import {AiEditorActionsService, AiElementCommand} from '../ai-editor-actions.service';

/** The ✨ button next to the description and the preferred name: asks the AI assistant to describe or translate the element. */
@Component({
  selector: 'ame-ai-field-action',
  templateUrl: './ai-field-action.component.html',
  styleUrls: ['./ai-field-action.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatIconButton, MatIcon, MatMenu, MatMenuItem, MatMenuTrigger, MatTooltip, TranslocoDirective],
})
export class AiFieldActionComponent {
  private readonly aiActions = inject(AiEditorActionsService);

  readonly element = input<NamedElement | null | undefined>(null);
  readonly disabled = input(false);

  /** Only named elements can be referenced in the conversation. */
  readonly urn = computed(() => {
    const element = this.element();
    return element && !element.isAnonymous?.() && !element.isPredefined ? element.aspectModelUrn : null;
  });
  readonly visible = computed(() => this.aiActions.enabled() && !!this.urn());

  ask(command: AiElementCommand): void {
    const urn = this.urn();
    if (urn) this.aiActions.askAboutElement(command, urn);
  }
}
