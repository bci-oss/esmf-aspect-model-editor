import { ComponentFixture, TestBed } from '@angular/core/testing';

import { VersionMigrationComponent } from './version-migration.component';

describe('VersionMigrationComponent', () => {
  let component: VersionMigrationComponent;
  let fixture: ComponentFixture<VersionMigrationComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ VersionMigrationComponent ]
    })
    .compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(VersionMigrationComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
