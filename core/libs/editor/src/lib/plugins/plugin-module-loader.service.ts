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

import {pluginFrontendPath, PluginsPort, PluginStatus} from '@ame/domain';
import {inject, Injectable} from '@angular/core';
import {firstValueFrom} from 'rxjs';

/** The module of a plugin was loaded in another version; custom elements cannot be redefined without a reload. */
export class PluginVersionChangedError extends Error {
  constructor(readonly plugin: PluginStatus) {
    super(`Version ${plugin.version} of the plugin "${plugin.id}" needs a restart of the application.`);
  }
}

/**
 * Loads the user interface of plugins. The module is fetched with the backend token and imported from a blob URL,
 * because a plain `import(url)` cannot authenticate. Therefore the module must be a single bundled ES module.
 */
@Injectable({providedIn: 'root'})
export class PluginModuleLoader {
  private readonly plugins = inject(PluginsPort);
  /** Loaded or loading modules per plugin id, with the version they were loaded in. */
  private readonly modules = new Map<string, {version: string; loaded: Promise<void>}>();

  /** Loads the module of the plugin once and resolves when its custom element is defined. */
  load(plugin: PluginStatus): Promise<void> {
    const loaded = this.modules.get(plugin.id);
    if (loaded) {
      return loaded.version === plugin.version ? loaded.loaded : Promise.reject(new PluginVersionChangedError(plugin));
    }

    const loading = this.importModule(plugin);
    this.modules.set(plugin.id, {version: plugin.version, loaded: loading});
    // A failed load may be retried, e.g. after the plugin was fixed and reinstalled.
    loading.catch(() => this.modules.delete(plugin.id));
    return loading;
  }

  private async importModule(plugin: PluginStatus): Promise<void> {
    const {entry, element} = plugin.frontend ?? {};
    if (!entry || !element) throw new Error(`The plugin "${plugin.id}" has no user interface.`);

    // A module from an earlier session of the page already defines the element.
    if (customElements.get(element)) return;

    const source = await firstValueFrom(this.plugins.getFrontendFile(plugin.id, pluginFrontendPath(entry)));
    const url = URL.createObjectURL(new Blob([source], {type: 'text/javascript'}));
    try {
      await this.importUrl(url);
    } finally {
      URL.revokeObjectURL(url);
    }

    if (!customElements.get(element)) {
      throw new Error(`The plugin "${plugin.id}" does not define the element <${element}>.`);
    }
  }

  /** Separate for tests; bundlers must not resolve the dynamic import. */
  protected importUrl(url: string): Promise<unknown> {
    return import(/* @vite-ignore */ /* webpackIgnore: true */ url);
  }
}
