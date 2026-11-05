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

import {GithubSourceConfig, GithubSourceStatus, ModelSourcesStore} from '@ame/domain';
import {NotificationsService} from '@ame/shared';
import {provideZonelessChangeDetection} from '@angular/core';
import {TestBed} from '@angular/core/testing';
import {TranslocoService} from '@jsverse/transloco';
import {of, throwError} from 'rxjs';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {GITHUB_UPDATE_CHECK_KEY, GithubUpdateCheckService} from './github-update-check.service';

const source: GithubSourceConfig = {id: 'gh', owner: 'org', repository: 'repo', ref: 'main', directory: 'models'};
const update: GithubSourceStatus = {source, path: '/github/gh', synced: true, updateAvailable: true};

describe('GithubUpdateCheckService', () => {
  let service: GithubUpdateCheckService;
  let store: Record<'refresh' | 'checkAll' | 'sync', ReturnType<typeof vi.fn>>;
  let notifications: Record<'info' | 'success' | 'error', ReturnType<typeof vi.fn>>;

  const run = (now: number) => {
    let result: GithubSourceStatus[] | undefined;
    service.checkOnStartup(now).subscribe(value => (result = value));
    return result;
  };

  beforeEach(() => {
    localStorage.removeItem(GITHUB_UPDATE_CHECK_KEY);
    store = {refresh: vi.fn(() => of([])), checkAll: vi.fn(() => of([update])), sync: vi.fn(() => of(update))};
    notifications = {info: vi.fn(), success: vi.fn(), error: vi.fn()};
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        {provide: ModelSourcesStore, useValue: store},
        {provide: NotificationsService, useValue: notifications},
        {
          provide: TranslocoService,
          useValue: {translate: (key: string, params?: object) => (params ? `${key} ${JSON.stringify(params)}` : key)},
        },
      ],
    });
    service = TestBed.inject(GithubUpdateCheckService);
  });

  afterEach(() => localStorage.removeItem(GITHUB_UPDATE_CHECK_KEY));

  it('notifies about updates and syncs only when the notification is clicked', () => {
    expect(run(1_000_000)).toEqual([update]);

    expect(notifications.info).toHaveBeenCalledWith(
      expect.objectContaining({
        message: `modelSources.github.updateNotificationMessage ${JSON.stringify({name: 'org/repo@main/models'})}`,
        timeout: 30_000,
      }),
    );
    expect(store.sync).not.toHaveBeenCalled();

    notifications.info.mock.calls[0][0].onClick();
    expect(store.sync).toHaveBeenCalledWith(source);
    expect(notifications.success).toHaveBeenCalled();
  });

  it('checks only once within five minutes', () => {
    run(1_000_000);
    expect(run(1_000_000 + 60_000)).toEqual([]);
    expect(store.checkAll).toHaveBeenCalledTimes(1);

    run(1_000_000 + 5 * 60_000);
    expect(store.checkAll).toHaveBeenCalledTimes(2);
  });

  it('ignores failures, e.g. without network', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    store.refresh.mockReturnValue(throwError(() => new Error('offline')));

    expect(run(1_000_000)).toEqual([]);
    expect(notifications.info).not.toHaveBeenCalled();
  });

  it('shows an error if the sync fails', () => {
    store.sync.mockReturnValue(throwError(() => ({error: {error: {message: 'Bad credentials'}}})));
    run(1_000_000);

    notifications.info.mock.calls[0][0].onClick();

    expect(notifications.error).toHaveBeenCalledWith(expect.objectContaining({message: 'Bad credentials'}));
  });
});
