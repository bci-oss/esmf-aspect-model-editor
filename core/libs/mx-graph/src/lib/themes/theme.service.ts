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

import {Injectable} from '@angular/core';
import {Cell, CellStyle, Graph} from '@maxgraph/core';
import {lightColors} from './light-theme';

@Injectable({providedIn: 'root'})
export class ThemeService {
  private root: HTMLElement = document.documentElement;
  private graph: Graph;

  public currentColors: any = lightColors;

  private static STROKE_WIDTH = 'strokeWidth';
  private static STROKE_Color = 'strokeColor';
  private static FILL_COLOR = 'fillColor';

  get getDefaultShapesColors() {
    return {
      [ThemeService.STROKE_WIDTH]: 2,
      [ThemeService.STROKE_Color]: this.currentColors.border,
      [ThemeService.FILL_COLOR]: this.currentColors.font,
    };
  }

  get theme() {
    return {
      aspect: {[ThemeService.FILL_COLOR]: this.currentColors.aspect},
      property: {[ThemeService.FILL_COLOR]: this.currentColors.property},
      abstractProperty: {[ThemeService.FILL_COLOR]: this.currentColors.abstractProperty},
      operation: {[ThemeService.FILL_COLOR]: this.currentColors.operation},
      event: {[ThemeService.FILL_COLOR]: this.currentColors.event},
      characteristic: {[ThemeService.FILL_COLOR]: this.currentColors.characteristic},
      abstractEntity: {[ThemeService.FILL_COLOR]: this.currentColors.entityValue},
      entity: {[ThemeService.FILL_COLOR]: this.currentColors.entity},
      constraint: {[ThemeService.FILL_COLOR]: this.currentColors.constraint},
      trait: {[ThemeService.FILL_COLOR]: this.currentColors.trait},
      unit: {[ThemeService.FILL_COLOR]: this.currentColors.unit},
      entityValue: {[ThemeService.FILL_COLOR]: this.currentColors.entityValue},
      filteredProperties_entity: {[ThemeService.FILL_COLOR]: this.currentColors.entity},
      filteredProperties_either: {[ThemeService.FILL_COLOR]: this.currentColors.characteristic},
    };
  }

  setGraph(graph: Graph) {
    this.graph = graph;
  }

  applyTheme(theme: string) {
    this.setCssVars(theme);
    this.graph.getChildVertices(this.graph.getDefaultParent()).forEach((cell: Cell) => {
      //debugger;
      this.graph.setCellStyle(this.generateThemeStyle(cell.id), [cell]);
    });
  }

  generateThemeStyle(styleName: string): CellStyle {
    if (!styleName) {
      return {} as CellStyle;
    }

    return {
      baseStyleNames: [styleName],
      ...Object.fromEntries(Object.entries(this.getDefaultShapesColors)),
      ...Object.fromEntries(Object.entries(this.theme[styleName])),
    } as CellStyle;
  }

  setCssVars(theme: string) {
    this.currentColors = theme === 'light' ? lightColors : null;
    Object.entries(this.currentColors).forEach(([key, color]: any) => this.root.style.setProperty(`--ame-${key}`, color));
  }
}
