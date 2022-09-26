import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MigrationStatusComponent } from './migration-status.component';

describe('MigrationStatusComponent', () => {
  let component: MigrationStatusComponent;
  let fixture: ComponentFixture<MigrationStatusComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ MigrationStatusComponent ]
    })
    .compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(MigrationStatusComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
