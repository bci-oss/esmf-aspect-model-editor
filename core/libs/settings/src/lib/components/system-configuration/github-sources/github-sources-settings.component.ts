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

import {
  describeSourceError,
  GithubRefType,
  GithubSourceConfig,
  GithubSourceStatus,
  GithubTokenStatus,
  ModelSourcesPort,
  ModelSourcesStore,
  parseGithubRepositoryUrl,
} from '@ame/domain';
import {NotificationsService} from '@ame/shared';
import {DatePipe} from '@angular/common';
import {ChangeDetectionStrategy, Component, computed, inject, OnInit, signal} from '@angular/core';
import {MatButton, MatIconButton} from '@angular/material/button';
import {MatButtonToggle, MatButtonToggleGroup} from '@angular/material/button-toggle';
import {MatFormField, MatHint, MatLabel} from '@angular/material/form-field';
import {MatIcon} from '@angular/material/icon';
import {MatInput} from '@angular/material/input';
import {MatMenu, MatMenuItem, MatMenuTrigger} from '@angular/material/menu';
import {MatProgressSpinner} from '@angular/material/progress-spinner';
import {MatTooltip} from '@angular/material/tooltip';
import {TranslocoDirective, TranslocoService} from '@jsverse/transloco';
import {switchMap} from 'rxjs';

const DEFAULT_HOST = 'github.com';

export type GithubSourceState = 'notSynced' | 'upToDate' | 'updateAvailable' | 'error' | 'disabled';
/** The one action offered next to the state; everything else is in the "more" menu. */
export type GithubPrimaryAction = 'download' | 'update' | 'retry';

/**
 * Read-only GitHub repositories as model sources. A source is downloaded to the local cache when added and only
 * updated when the user synchronizes it.
 */
@Component({
  selector: 'ame-github-sources-settings',
  templateUrl: './github-sources-settings.component.html',
  styleUrls: ['../model-sources.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    MatButton,
    MatIconButton,
    MatButtonToggleGroup,
    MatButtonToggle,
    MatFormField,
    MatLabel,
    MatHint,
    MatIcon,
    MatInput,
    MatProgressSpinner,
    MatMenu,
    MatMenuItem,
    MatMenuTrigger,
    MatTooltip,
    TranslocoDirective,
  ],
})
export class GithubSourcesSettingsComponent implements OnInit {
  readonly store = inject(ModelSourcesStore);
  private readonly api = inject(ModelSourcesPort, {optional: true});
  private readonly notifications = inject(NotificationsService);
  private readonly transloco = inject(TranslocoService);

  readonly canStoreTokens = !!this.api?.canStoreTokens();

  readonly url = signal('');
  readonly refType = signal<GithubRefType>('branch');
  readonly ref = signal('main');
  readonly directory = signal('');
  readonly adding = signal(false);
  readonly showAdvanced = signal(false);
  readonly checkingAll = signal(false);
  readonly loadError = signal('');

  readonly parsedUrl = computed(() => parseGithubRepositoryUrl(this.url()));
  readonly urlInvalid = computed(() => !!this.url().trim() && !this.parsedUrl());
  readonly canAdd = computed(() => !!this.parsedUrl() && !!this.ref().trim() && !this.adding());

  readonly sources = computed(() => this.store.config()?.githubSources ?? []);

  /** Hosts a token can be stored for: github.com and the hosts of the configured sources (GitHub Enterprise). */
  readonly tokenHosts = computed(() => [...new Set([DEFAULT_HOST, ...this.sources().map(source => source.host || DEFAULT_HOST)])]);
  readonly tokenStatus = signal<Record<string, GithubTokenStatus | null>>({});
  readonly tokenInput = signal<Record<string, string>>({});
  readonly tokenBusy = signal(false);
  /** The host whose token input is open; the input is hidden until the user wants to set a token. */
  readonly tokenEditing = signal<string | null>(null);

  ngOnInit(): void {
    this.store.refresh().subscribe({
      next: () => {
        this.loadError.set('');
        this.loadTokenStatus();
      },
      error: error => this.loadError.set(describeSourceError(error) || this.transloco.translate('modelSources.loadError')),
    });
  }

  /** A URL like `…/tree/main/models` already contains branch and folder; they are taken over into the advanced fields. */
  onUrlInput(value: string): void {
    this.url.set(value);
    const parsed = parseGithubRepositoryUrl(value);
    if (parsed?.ref) this.ref.set(parsed.ref);
    if (parsed?.directory) this.directory.set(parsed.directory);
  }

  /** Adds the source and downloads it right away; the user explicitly asked for it. */
  add(): void {
    const parsed = this.parsedUrl();
    if (!parsed || !this.ref().trim()) return;

    const source: GithubSourceConfig = {
      host: parsed.host,
      owner: parsed.owner,
      repository: parsed.repository,
      refType: this.refType(),
      ref: this.ref().trim(),
      directory:
        this.directory()
          .trim()
          .replace(/^\/+|\/+$/g, '') || undefined,
      enabled: true,
    };

    this.adding.set(true);
    this.store
      .addGithubSource(source)
      .pipe(switchMap(status => this.store.sync(status.source)))
      .subscribe({
        next: status => {
          this.adding.set(false);
          this.resetForm();
          this.loadTokenStatus();
          this.notifications.success({
            title: this.transloco.translate('modelSources.github.added', {name: this.displayName(status.source)}),
          });
        },
        error: error => {
          this.adding.set(false);
          this.loadTokenStatus();
          this.notifyError('modelSources.github.addError', error);
        },
      });
  }

  check(source: GithubSourceConfig): void {
    this.store.check(source).subscribe({
      next: status => {
        if (status.lastError) return;
        const key = status.updateAvailable ? 'modelSources.github.updateFound' : 'modelSources.github.upToDate';
        this.notifications.info({title: this.transloco.translate(key, {name: this.displayName(source)})});
      },
      error: error => this.notifyError('modelSources.github.checkError', error),
    });
  }

  sync(source: GithubSourceConfig): void {
    this.store.sync(source).subscribe({
      next: () =>
        this.notifications.success({title: this.transloco.translate('modelSources.github.synced', {name: this.displayName(source)})}),
      error: error => this.notifyError('modelSources.github.syncError', error),
    });
  }

  checkAll(): void {
    this.checkingAll.set(true);
    this.store.checkAll().subscribe({
      next: updates => {
        this.checkingAll.set(false);
        const title = updates.length
          ? this.transloco.translate('modelSources.github.updatesFound', {count: updates.length})
          : this.transloco.translate('modelSources.github.allUpToDate');
        this.notifications.info({title});
      },
      error: error => {
        this.checkingAll.set(false);
        this.notifyError('modelSources.github.checkError', error);
      },
    });
  }

  primaryAction(source: GithubSourceConfig): GithubPrimaryAction | null {
    switch (this.state(source)) {
      case 'notSynced':
        return 'download';
      case 'updateAvailable':
        return 'update';
      case 'error':
        return 'retry';
      default:
        return null;
    }
  }

  /** Branch or tag, folder and downloaded version in one line, e.g. "Branch main · Folder models · Version 1a2b3c4 from …". */
  details(source: GithubSourceConfig, syncedDate: string | null): string {
    const parts = [
      this.transloco.translate(source.refType === 'tag' ? 'modelSources.github.details.tag' : 'modelSources.github.details.branch', {
        ref: source.ref,
      }),
    ];
    if (source.directory) parts.push(this.transloco.translate('modelSources.github.details.folder', {folder: source.directory}));
    const status = this.status(source);
    if (status?.synced) {
      parts.push(
        this.transloco.translate('modelSources.github.syncedInfo', {
          sha: this.shortSha(status.syncedSha),
          date: syncedDate ?? '',
        }),
      );
    }
    return parts.join(' · ');
  }

  repositoryName(source: GithubSourceConfig): string {
    const host = source.host && source.host !== DEFAULT_HOST ? `${source.host}/` : '';
    return `${host}${source.owner}/${source.repository}`;
  }

  toggleEnabled(source: GithubSourceConfig, enabled: boolean): void {
    if (!source.id) return;
    this.store.updateGithubSource(source.id, {...source, enabled}).subscribe({
      error: error => this.notifyError('modelSources.github.updateError', error),
    });
  }

  remove(source: GithubSourceConfig): void {
    if (!source.id) return;
    this.store.removeGithubSource(source.id).subscribe({
      next: () =>
        this.notifications.success({title: this.transloco.translate('modelSources.github.removed', {name: this.displayName(source)})}),
      error: error => this.notifyError('modelSources.github.removeError', error),
    });
  }

  state(source: GithubSourceConfig): GithubSourceState {
    if (source.enabled === false) return 'disabled';
    const status = source.id ? this.store.githubStatus(source.id) : undefined;
    if (status?.lastError) return 'error';
    if (!status?.synced) return 'notSynced';
    return status.updateAvailable ? 'updateAvailable' : 'upToDate';
  }

  status(source: GithubSourceConfig): GithubSourceStatus | undefined {
    return source.id ? this.store.githubStatus(source.id) : undefined;
  }

  displayName(source: GithubSourceConfig): string {
    const host = source.host && source.host !== DEFAULT_HOST ? `${source.host}/` : '';
    const directory = source.directory ? `/${source.directory}` : '';
    return `${host}${source.owner}/${source.repository}@${source.ref}${directory}`;
  }

  shortSha(sha: string | null | undefined): string {
    return sha ? sha.substring(0, 7) : '';
  }

  editToken(host: string | null): void {
    this.tokenEditing.set(host);
    if (host) this.setTokenInput(host, '');
  }

  setTokenInput(host: string, value: string): void {
    this.tokenInput.update(inputs => ({...inputs, [host]: value}));
  }

  saveToken(host: string): void {
    const token = (this.tokenInput()[host] ?? '').trim();
    if (!token || !this.api) return;
    this.tokenBusy.set(true);
    this.api.setToken(host, token).subscribe({
      next: status => {
        this.tokenBusy.set(false);
        this.setTokenInput(host, '');
        this.tokenEditing.set(null);
        this.tokenStatus.update(statuses => ({...statuses, [host]: status}));
        const key = status?.persistent ? 'modelSources.token.saved' : 'modelSources.token.savedSession';
        this.notifications.success({title: this.transloco.translate(key, {host})});
      },
      error: error => {
        this.tokenBusy.set(false);
        this.notifyError('modelSources.token.saveError', error);
      },
    });
  }

  deleteToken(host: string): void {
    if (!this.api) return;
    this.tokenBusy.set(true);
    this.api.deleteToken(host).subscribe({
      next: () => {
        this.tokenBusy.set(false);
        this.tokenStatus.update(statuses => ({...statuses, [host]: {stored: false, persistent: false}}));
        this.notifications.success({title: this.transloco.translate('modelSources.token.deleted', {host})});
      },
      error: error => {
        this.tokenBusy.set(false);
        this.notifyError('modelSources.token.deleteError', error);
      },
    });
  }

  private loadTokenStatus(): void {
    if (!this.canStoreTokens || !this.api) return;
    for (const host of this.tokenHosts()) {
      this.api.getTokenStatus(host).subscribe({
        next: status => this.tokenStatus.update(statuses => ({...statuses, [host]: status})),
        error: () => this.tokenStatus.update(statuses => ({...statuses, [host]: null})),
      });
    }
  }

  private resetForm(): void {
    this.url.set('');
    this.refType.set('branch');
    this.ref.set('main');
    this.directory.set('');
    this.showAdvanced.set(false);
  }

  private notifyError(titleKey: string, error: unknown): void {
    this.notifications.error({title: this.transloco.translate(titleKey), message: describeSourceError(error), timeout: 6000});
  }
}
