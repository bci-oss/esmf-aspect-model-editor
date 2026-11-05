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

import {ModelOpenerPort, ModelSource, ModelSourcesStore, WorkspaceFacade, WorkspaceStore} from '@ame/domain';
import {ClipboardService, LanguageTranslationService, NotificationsService} from '@ame/shared';
import {Component, computed, DestroyRef, effect, inject, signal} from '@angular/core';
import {takeUntilDestroyed} from '@angular/core/rxjs-interop';
import {MatMiniFabButton} from '@angular/material/button';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatIconModule} from '@angular/material/icon';
import {MatInput} from '@angular/material/input';
import {MatMenu, MatMenuItem, MatMenuTrigger} from '@angular/material/menu';
import {MatTooltip} from '@angular/material/tooltip';
import {TranslocoDirective} from '@jsverse/transloco';
import {FileStatus, SidebarStateService} from '../../sidebar-state.service';
import {WorkspaceDeletionService} from '../workspace-deletion/workspace-deletion.service';
import {WorkspaceMigrateComponent} from '../workspace-migrate/workspace-migrate.component';

/** The files of one source (workspace or GitHub repository), grouped by namespace. */
export interface SourceGroup {
  /** Stable key; `''` for files without a known source (e.g. an older backend). */
  key: string;
  source?: ModelSource;
  readOnly: boolean;
  namespaces: {key: string; files: FileStatus[]}[];
}

@Component({
  selector: 'ame-workspace-file-list',
  templateUrl: './workspace-file-list.component.html',
  styleUrls: ['./workspace-file-list.component.scss'],
  imports: [
    MatFormFieldModule,
    MatIconModule,
    MatInput,
    MatTooltip,
    MatMiniFabButton,
    MatMenuTrigger,
    MatMenu,
    MatMenuItem,
    WorkspaceMigrateComponent,
    TranslocoDirective,
  ],
})
export class WorkspaceFileListComponent {
  private readonly notificationService = inject(NotificationsService);
  private readonly modelApiService = inject(WorkspaceFacade);
  private readonly modelOpener = inject(ModelOpenerPort, {optional: true});
  private readonly translate = inject(LanguageTranslationService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly clipboard = inject(ClipboardService);

  public readonly sidebarService = inject(SidebarStateService);
  public readonly workspaceStore = inject(WorkspaceStore);
  public readonly deletion = inject(WorkspaceDeletionService);
  private readonly modelSources = inject(ModelSourcesStore);

  public readonly menuSelection = signal<{namespace: string; file: FileStatus} | null>(null);
  public readonly namespaceMenuSelection = signal<string | null>(null);
  public readonly foldedStatus = signal(false);
  public readonly searched = signal<Record<string, FileStatus[]>>({});
  public readonly folded = signal<Record<string, boolean>>({});
  public readonly searchString = signal('');
  public readonly collapsedSources = signal<ReadonlySet<string>>(new Set());

  /**
   * Workspaces first (default workspace on top), then GitHub sources, each with its namespaces in alphabetical order.
   * With a single source the headers are hidden and the list looks like before.
   */
  public readonly groups = computed<SourceGroup[]>(() => {
    const sources = this.modelSources.sources();
    const order = [...sources].sort((a, b) => rank(a) - rank(b));
    const groups = new Map<string, SourceGroup>(
      order.map(source => [source.id, {key: source.id, source, readOnly: source.readOnly, namespaces: []}]),
    );
    const fallbackKey = order.find(source => source.defaultWorkspace)?.id ?? '';

    for (const [namespace, files] of Object.entries(this.searched()).sort(([a], [b]) => a.localeCompare(b))) {
      const bySource = new Map<string, FileStatus[]>();
      for (const file of files) {
        const key = file.source?.id && groups.has(file.source.id) ? file.source.id : fallbackKey;
        bySource.set(key, [...(bySource.get(key) ?? []), file]);
      }
      for (const [key, sourceFiles] of bySource) {
        if (!groups.has(key)) groups.set(key, {key, readOnly: false, namespaces: []});
        groups.get(key)?.namespaces.push({key: namespace, files: sourceFiles});
      }
    }

    return [...groups.values()].filter(group => group.namespaces.length || (!this.searchString() && group.source));
  });

  public readonly showSourceHeaders = computed(() => this.modelSources.sources().length > 1);

  public get namespaces() {
    return this.sidebarService.namespacesState.namespaces();
  }

  public get selection() {
    return this.sidebarService.selection;
  }

  private searchThrottle: NodeJS.Timeout | null = null;

  constructor() {
    this.destroyRef.onDestroy(() => {
      if (this.searchThrottle) {
        clearTimeout(this.searchThrottle);
      }
    });

    effect(() => {
      const namespaces = this.sidebarService.namespacesState.namespaces();
      const currentFolded = this.foldedStatus();

      const newSearched: Record<string, FileStatus[]> = {};
      const newFolded: Record<string, boolean> = {};

      for (const namespace in namespaces) {
        newSearched[namespace] = namespaces[namespace];
        newFolded[namespace] = currentFolded;
      }

      this.searched.set(newSearched);
      this.folded.set(newFolded);
    });
  }

  public toggleFold() {
    const newFoldedStatus = !this.foldedStatus();
    this.foldedStatus.set(newFoldedStatus);

    const currentFolded = this.folded();
    const newFolded: Record<string, boolean> = {};

    for (const namespace in currentFolded) {
      newFolded[namespace] = newFoldedStatus;
    }

    this.folded.set(newFolded);
  }

  public search($event: KeyboardEvent) {
    const target = $event.target as HTMLInputElement;
    const newSearchString = target.value.toLowerCase();
    this.searchString.set(newSearchString);

    if (this.searchThrottle) {
      clearTimeout(this.searchThrottle);
    }

    this.searchThrottle = setTimeout(() => {
      const namespaces = this.namespaces;
      const newSearched: Record<string, FileStatus[]> = {};

      for (const namespace in namespaces) {
        if (namespace.toLowerCase().includes(newSearchString)) {
          newSearched[namespace] = namespaces[namespace];
          continue;
        }

        newSearched[namespace] = newSearchString
          ? namespaces[namespace].filter(file => file.name.toLowerCase().includes(newSearchString))
          : namespaces[namespace];
      }

      this.searched.set(newSearched);
    }, 100);
  }

  public selectFile(namespace: string, file: FileStatus) {
    if (file.outdated || file.errored) {
      return;
    }

    if (!this.sidebarService.isCurrentFileLoaded()) {
      this.notificationService.info({
        title: this.translate.language.notificationService.loadModelInfoTitle,
        message: this.translate.language.notificationService.loadModelInfoMessage,
      });
      return;
    }

    if (this.sidebarService.isCurrentFile(namespace, file.name)) {
      return;
    }

    this.sidebarService.selection.select(namespace, file);
  }

  public isOpenable() {
    const selection = this.menuSelection();
    if (!selection) return false;

    const {file} = selection;
    return !(file.outdated || file.errored || this.isReadOnly(file));
  }

  /** Explains why "Open" is disabled for files of GitHub sources. */
  public openTooltip(): string {
    return this.isReadOnly(this.menuSelection()?.file)
      ? this.translate.translateService.translate('modelSources.sidebar.readOnlyOpen')
      : '';
  }

  public openContextMenu($event: MouseEvent, namespace: string, file: FileStatus, trigger: MatMenuTrigger) {
    $event.preventDefault();
    $event.stopPropagation();
    this.prepare(namespace, file);
    trigger.openMenu();
  }

  public loadInNewTab() {
    const selection = this.menuSelection();
    if (!selection || !this.isOpenable()) return;

    this.modelOpener
      ?.openInNewTab({
        file: selection.file.name,
        namespace: selection.namespace,
        aspectModelUrn: selection.file.aspectModelUrn,
      })
      .subscribe();

    this.menuSelection.set(null);
  }

  public loadInNewWindow() {
    const selection = this.menuSelection();
    if (!selection || !this.isOpenable()) return;

    this.modelOpener?.openInNewWindow({
      namespace: selection.namespace,
      file: selection.file.name,
      aspectModelUrn: selection.file.aspectModelUrn,
    });

    this.menuSelection.set(null);
  }

  public isLoadDisabled() {
    const selection = this.menuSelection();
    if (!selection) return true;

    const {namespace, file} = selection;
    return this.sidebarService.isCurrentFile(namespace, file.name) || !this.isOpenable();
  }

  public isCurrentFile(namespace?: string, fileName?: string): boolean {
    return this.sidebarService.isCurrentFile(namespace, fileName);
  }

  public isDeleteDisabled() {
    const selection = this.menuSelection();
    return !selection || this.deletion.fileBlockReason(selection.namespace, selection.file.name) !== null;
  }

  /** Explains why the selected file cannot be deleted. */
  public deleteTooltip(): string {
    const selection = this.menuSelection();
    return selection ? this.deletion.blockReasonText('file', this.deletion.fileBlockReason(selection.namespace, selection.file.name)) : '';
  }

  public isNamespaceDeleteDisabled() {
    const namespace = this.namespaceMenuSelection();
    return !namespace || this.deletion.namespaceBlockReason(namespace) !== null;
  }

  /** Explains why the selected namespace version cannot be deleted. */
  public namespaceDeleteTooltip(): string {
    const namespace = this.namespaceMenuSelection();
    return namespace ? this.deletion.blockReasonText('namespace', this.deletion.namespaceBlockReason(namespace)) : '';
  }

  public prepareNamespaceMenu(namespace: string) {
    this.namespaceMenuSelection.set(namespace);
  }

  public deleteNamespace() {
    const namespace = this.namespaceMenuSelection();
    if (!namespace || this.isNamespaceDeleteDisabled()) return;

    this.deletion.deleteNamespace(namespace).pipe(takeUntilDestroyed(this.destroyRef)).subscribe();
  }

  public promptOpenFile(namespace: string, file: FileStatus) {
    if (this.isReadOnly(file)) {
      this.selectFile(namespace, file);
      return;
    }
    if (file.outdated || file.errored || this.isCurrentFile(namespace, file.name)) {
      return;
    }

    this.modelOpener
      ?.promptAndOpen({
        file: file.name,
        namespace,
        aspectModelUrn: file.aspectModelUrn,
      })
      .subscribe();
  }

  public openFile() {
    const selection = this.menuSelection();
    if (!selection || !this.isOpenable()) return;

    this.modelOpener
      ?.openInCurrentWindow({
        file: selection.file.name,
        namespace: selection.namespace,
        aspectModelUrn: selection.file.aspectModelUrn,
      })
      .subscribe();

    this.menuSelection.set(null);
  }

  public deleteFile() {
    const selection = this.menuSelection();
    if (!selection || this.isDeleteDisabled()) return;

    this.deletion.deleteFile(selection.namespace, selection.file).pipe(takeUntilDestroyed(this.destroyRef)).subscribe();
  }

  public copyNamespace() {
    this.copyFilePath();
  }

  public copyFilePath() {
    const selection = this.menuSelection();
    if (!selection) return;

    const {namespace, file} = selection;
    const separator = namespace.lastIndexOf(':');
    const sourceRoot = file.source?.path || '';
    if (separator < 0) {
      this.copyLocation(file, this.buildOsFilePath(sourceRoot, namespace, file.name));
      return;
    }

    this.modelApiService
      .getStoragePath({
        namespace: namespace.substring(0, separator),
        version: namespace.substring(separator + 1),
        fileName: file.name,
        workspace: file.source?.path,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: response => this.copyLocation(file, response?.storagePath || this.buildOsFilePath(sourceRoot, namespace, file.name)),
        error: () => this.copyLocation(file, this.buildOsFilePath(sourceRoot, namespace, file.name)),
      });
  }

  /** Files of GitHub sources are copied as link to the file in the repository, all others as local path. */
  private copyLocation(file: FileStatus, localPath: string) {
    const url = this.githubFileUrl(file, localPath);
    this.copyToClipboard(url ?? localPath, url ? 'sidebar.fileMenu.copiedGithubUrl' : 'sidebar.fileMenu.copiedFilePath');
  }

  private githubFileUrl(file: FileStatus, localPath: string): string | null {
    const source = file.source;
    if (source?.type !== 'github') return null;
    const config = this.modelSources.config()?.githubSources.find(github => github.id === source.id);
    if (!config) return null;

    const root = source.path.replace(/\\/g, '/').replace(/\/+$/, '');
    const path = localPath.replace(/\\/g, '/');
    if (!root || !path.startsWith(`${root}/`)) return null;

    const segments = [...(config.directory ?? '').split('/'), ...path.substring(root.length + 1).split('/')].filter(
      segment => segment.length,
    );
    const encode = (value: string) => value.split('/').map(encodeURIComponent).join('/');
    return `https://${config.host || 'github.com'}/${encode(config.owner)}/${encode(config.repository)}/blob/${encode(config.ref)}/${segments.map(encodeURIComponent).join('/')}`;
  }

  private buildOsFilePath(storagePath: string, namespaceKey: string, fileName: string): string {
    if (!storagePath) {
      return `${namespaceKey.replace(/:([^:]*)$/, '/$1')}/${fileName}`;
    }

    const isWindows = storagePath.includes('\\');
    const sep = isWindows ? '\\' : '/';
    const cleanStoragePath = storagePath.replace(/[/\\]+$/, '');

    const separator = namespaceKey.lastIndexOf(':');
    const [namespace, version] =
      separator < 0 ? [namespaceKey, ''] : [namespaceKey.substring(0, separator), namespaceKey.substring(separator + 1)];
    const segments = version ? [namespace, version, fileName] : [namespace, fileName];

    return `${cleanStoragePath}${sep}${segments.join(sep)}`;
  }

  private copyToClipboard(text: string, titleKey = 'sidebar.fileMenu.copiedFilePath') {
    this.clipboard.copy(text);

    const title = this.translate.translateService.translate(titleKey) || 'Copied to clipboard';
    this.notificationService.success({title, message: text});
  }

  public prepare(namespace: string, file: FileStatus) {
    this.menuSelection.set({namespace, file});
  }

  public sortNamespaces(namespaces: {key: string; value: any}[]) {
    return namespaces.sort((n1, n2) => (n1.key >= n2.key ? 1 : -1));
  }

  public toggleSource(key: string) {
    this.collapsedSources.update(keys => {
      const next = new Set(keys);
      if (!next.delete(key)) next.add(key);
      return next;
    });
  }

  public isSourceCollapsed(key: string): boolean {
    return this.showSourceHeaders() && this.collapsedSources().has(key) && !this.searchString();
  }

  /** Files of GitHub sources are only shown in the element list; they cannot be opened in the editor. */
  public isReadOnly(file: FileStatus | undefined): boolean {
    return !!file?.source?.readOnly;
  }

  public toggleNamespaceFold(namespaceKey: string) {
    const currentFolded = this.folded();
    this.folded.set({
      ...currentFolded,
      [namespaceKey]: !currentFolded[namespaceKey],
    });
  }

  public getFileTooltip(namespaceKey: string, file: FileStatus): string {
    const tooltip = this.getStateTooltip(namespaceKey, file);
    return file.source && (file.source.readOnly || this.modelSources.sources().length > 1)
      ? `${tooltip} · ${this.sourceTooltip(file)}`
      : tooltip;
  }

  /** Where the file comes from; files of GitHub sources are read-only. */
  public sourceTooltip(file: FileStatus): string {
    const source = file.source;
    if (!source) return '';
    const key = source.readOnly ? 'modelSources.sidebar.readOnlySource' : 'modelSources.sidebar.workspaceSource';
    return this.translate.translateService.translate(key, {name: source.name});
  }

  private getStateTooltip(namespaceKey: string, file: FileStatus): string {
    if (this.isCurrentFile(namespaceKey, file.name)) {
      const tooltip = this.translate.language.tooltips?.currentFile || 'Currently opened file';
      return `${file.name} (${tooltip})`;
    }
    if (file.outdated) {
      const sammVersion = file.sammVersion || '';
      const tooltip = this.translate.translateService.translate('tooltips.outdatedFile', {sammVersion: sammVersion || 'older'});
      return `${file.name} (${tooltip})`;
    }
    if (file.errored) {
      const tooltip = this.translate.language.tooltips?.erroredFile || 'File has errors';
      return `${file.name} (${tooltip})`;
    }
    if (this.hasMissingReferences(file)) {
      const tooltip = this.translate.translateService.translate('tooltips.fileWithMissingReferences', {
        namespaces: file.missingDependencies.join(', '),
      });
      return `${file.name} (${tooltip})`;
    }
    return file.name;
  }

  /** Files referencing namespaces which are not in the workspace can be opened; the missing elements are shown as placeholders. */
  hasMissingReferences(file: FileStatus): boolean {
    return !file.errored && !!file.missingDependencies?.length;
  }
}

function rank(source: ModelSource): number {
  if (source.defaultWorkspace) return 0;
  return source.type === 'workspace' ? 1 : 2;
}
