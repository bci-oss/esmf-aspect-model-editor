import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MigrationSuccessComponent } from './migration-success.component';

describe('MigrationSuccessComponent', () => {
  let component: MigrationSuccessComponent;
  let fixture: ComponentFixture<MigrationSuccessComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ MigrationSuccessComponent ]
    })
    .compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(MigrationSuccessComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
