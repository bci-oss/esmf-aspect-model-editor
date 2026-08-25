import {beforeEach, describe, expect, it, vi} from 'vitest';

import {FileHandlingService, ModelCheckerService, SaveModelDialogService} from '@ame/editor';
import {MaxGraphAttributeService, MaxGraphService, MaxGraphShapeOverlayService} from '@ame/max-graph';
import {ModelSavingTrackerService, NotificationsService, SearchService} from '@ame/shared';
import {SidebarStateService} from '@ame/sidebar';
import {LanguageTranslationService} from '@ame/translation';
import {provideHttpClient, withXhr} from '@angular/common/http';
import {provideHttpClientTesting} from '@angular/common/http/testing';
import {signal} from '@angular/core';
import {ComponentFixture, TestBed} from '@angular/core/testing';
import {FormsModule} from '@angular/forms';
import {MatDialog, MatDialogModule, MatDialogRef} from '@angular/material/dialog';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {By} from '@angular/platform-browser';
import {BrowserAnimationsModule} from '@angular/platform-browser/animations';
import {TranslocoService} from '@jsverse/transloco';
import {MockProvider} from 'ng-mocks';
import {BehaviorSubject, of, Subject} from 'rxjs';
import {SearchesStateService} from '../../search-state.service';
import {FilesSearchComponent} from './files-search.component';

vi.mock('@ame/editor', () => ({
  ModelElementEditorComponent: class {},
  SaveModelDialogService: class {},
  FileHandlingService: class {},
  ModelCheckerService: class {
    detectWorkspaceErrors = vi.fn();
  },
}));

describe('Files search', () => {
  let component: FilesSearchComponent;
  let fixture: ComponentFixture<FilesSearchComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FilesSearchComponent, FormsModule, MatFormFieldModule, MatInputModule, MatDialogModule, BrowserAnimationsModule],
      providers: [
        provideHttpClient(withXhr()),
        provideHttpClientTesting(),
        MockProvider(MatDialogRef),
        MockProvider(MaxGraphService),
        MockProvider(NotificationsService),
        MockProvider(MaxGraphShapeOverlayService),
        MockProvider(MaxGraphAttributeService),
        MockProvider(TranslocoService, {
          langChanges$: new BehaviorSubject('en'),
          events$: new Subject(),
          translate: vi.fn(() => ''),
          selectTranslate: vi.fn(() => of('')),
          _loadDependencies: vi.fn(() => of(undefined)),
          config: {reRenderOnLangChange: false} as any,
        } as Partial<TranslocoService>),
        MockProvider(SearchesStateService),
        MockProvider(SidebarStateService, {
          namespacesState: {namespaces: signal({})} as any,
          updateWorkspace: vi.fn(() => of({})) as any,
        }),
        MockProvider(MatDialog),
        MockProvider(ModelSavingTrackerService),
        MockProvider(SearchService),
        MockProvider(LanguageTranslationService),
        MockProvider(FileHandlingService),
        MockProvider(SaveModelDialogService),
        MockProvider(ModelCheckerService, {
          detectWorkspaceErrors: vi.fn(() => of([])),
        }),
      ],
    }).compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(FilesSearchComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  const files = [
    {
      name: 'AspectDefault.ttl',
      loaded: true,
      outdated: false,
      errored: false,
      sammVersion: '2.1.0',
    },
    {
      name: 'SharedModel.ttl',
      outdated: false,
      errored: false,
      loaded: true,
      sammVersion: '2.1.0',
    },
  ];

  const namespaces = {
    'org.eclipse.examples:1.0.0': files,
  };

  it('should parse files correctly', () => {
    component.parseFiles(namespaces as any);

    expect(component.searchableFiles()).toEqual([
      {file: 'AspectDefault.ttl', namespace: 'org.eclipse.examples:1.0.0'},
      {file: 'SharedModel.ttl', namespace: 'org.eclipse.examples:1.0.0'},
    ]);
  });

  it('should have mat option if there are namespaces with files', () => {
    vi.spyOn(component, 'openFile');

    component.searchableFiles.set(files);
    fixture.detectChanges();
    const autocomplete = fixture.debugElement.query(By.css('mat-autocomplete'));
    expect(autocomplete).toBeTruthy();
    fixture.detectChanges();
    const matOptions = autocomplete.nativeElement.querySelectorAll('mat-option');
    expect(matOptions).toBeTruthy();
  });
});
