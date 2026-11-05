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

import {GithubSourceStatus, ModelSourcesStore} from '@ame/domain';
import {NotificationsService} from '@ame/shared';
import {inject, Injectable} from '@angular/core';
import {TranslocoService} from '@jsverse/transloco';
import {catchError, EMPTY, Observable, of, switchMap, tap} from 'rxjs';

export const GITHUB_UPDATE_CHECK_KEY = 'ame.githubSources.lastUpdateCheck';
/** Windows opened shortly after each other share one check. */
const CHECK_INTERVAL_MS = 5 * 60 * 1000;
/** Notifications about updates stay long enough to be noticed; the settings also show available updates. */
const NOTIFICATION_TIMEOUT_MS = 30_000;

/**
 * Checks the GitHub sources for newer commits after startup and offers to synchronize them.
 * Nothing is downloaded without the user clicking the notification.
 */
@Injectable({providedIn: 'root'})
export class GithubUpdateCheckService {
  private readonly store = inject(ModelSourcesStore);
  private readonly notifications = inject(NotificationsService);
  private readonly transloco = inject(TranslocoService);

  checkOnStartup(now = Date.now()): Observable<GithubSourceStatus[]> {
    if (!this.isDue(now)) return of([]);
    this.remember(now);
    return this.store.refresh().pipe(
      switchMap(() => this.store.checkAll()),
      tap(updates => updates.forEach(status => this.notify(status))),
      catchError(error => {
        console.warn('Checking the GitHub sources for updates failed', error);
        return of([]);
      }),
    );
  }

  private notify(status: GithubSourceStatus): void {
    const source = status.source;
    const name = `${source.owner}/${source.repository}@${source.ref}${source.directory ? '/' + source.directory : ''}`;
    this.notifications.info({
      title: this.transloco.translate('modelSources.github.updateNotificationTitle'),
      message: this.transloco.translate('modelSources.github.updateNotificationMessage', {name}),
      timeout: NOTIFICATION_TIMEOUT_MS,
      onClick: () =>
        this.store
          .sync(source)
          .pipe(
            tap(() => this.notifications.success({title: this.transloco.translate('modelSources.github.synced', {name})})),
            catchError(error => {
              this.notifications.error({
                title: this.transloco.translate('modelSources.github.syncError'),
                message: (error?.error?.error?.message ?? error?.message ?? String(error)) as string,
                timeout: 6000,
              });
              return EMPTY;
            }),
          )
          .subscribe(),
    });
  }

  private isDue(now: number): boolean {
    try {
      const last = Number(localStorage.getItem(GITHUB_UPDATE_CHECK_KEY) ?? 0);
      return !last || now - last >= CHECK_INTERVAL_MS || now < last;
    } catch {
      return true;
    }
  }

  private remember(now: number): void {
    try {
      localStorage.setItem(GITHUB_UPDATE_CHECK_KEY, String(now));
    } catch {
      // storage unavailable: every window checks
    }
  }
}
