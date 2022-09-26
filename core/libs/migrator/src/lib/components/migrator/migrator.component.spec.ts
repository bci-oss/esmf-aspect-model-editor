import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MigratorComponent } from './migrator.component';

describe('MigratorComponent', () => {
  let component: MigratorComponent;
  let fixture: ComponentFixture<MigratorComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ MigratorComponent ]
    })
    .compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(MigratorComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
