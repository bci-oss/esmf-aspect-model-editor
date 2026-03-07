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

import {CommonModule} from '@angular/common';
import {Component, inject, input, OnChanges} from '@angular/core';
import {MatIconModule} from '@angular/material/icon';
import {MatTooltip, MatTooltipModule} from '@angular/material/tooltip';
import {ElementSymbols, ElementType} from '../../model';

interface ElementInfo {
  type: ElementType | 'text';
  symbol?: ElementSymbols | 'T';
}

@Component({
  standalone: true,
  selector: 'ame-element',
  templateUrl: './element.component.html',
  styleUrls: ['./element.component.scss'],
  host: {
    '[class.new-value]': 'isNewValue()',
  },
  hostDirectives: [MatTooltip],
  imports: [CommonModule, MatTooltipModule, MatIconModule],
})
export class ElementIconComponent implements OnChanges {
  readonly type = input.required<ElementInfo>();
  readonly size = input<'small' | 'medium' | 'large'>('large');
  readonly name = input('');
  readonly description = input('');
  readonly disabledTooltipNameLength = input(30);
  readonly disabledTooltipDescriptionLength = input(40);

  private matTooltip = inject(MatTooltip);

  public isNewValue = input(false);
  public className = '';

  ngOnChanges(): void {
    const type = this.type();
    if (type) {
      this.className = `${type.type.toLowerCase()} ame-${this.size()}`;
    }

    this.matTooltip.message = `${this.isNewValue() ? 'New ' : ''}${type.type === 'text' ? 'Simple value' : 'Element'}`;
    this.matTooltip.position = 'before';
  }
}
