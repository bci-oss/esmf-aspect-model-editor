import { ComponentFixture, TestBed } from '@angular/core/testing';

import { StartMigratingComponent } from './start-migrating.component';

describe('StartMigratingComponent', () => {
  let component: StartMigratingComponent;
  let fixture: ComponentFixture<StartMigratingComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ StartMigratingComponent ]
    })
    .compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(StartMigratingComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
