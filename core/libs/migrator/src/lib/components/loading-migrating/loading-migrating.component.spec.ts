import { ComponentFixture, TestBed } from '@angular/core/testing';

import { LoadingMigratingComponent } from './loading-migrating.component';

describe('LoadingMigratingComponent', () => {
  let component: LoadingMigratingComponent;
  let fixture: ComponentFixture<LoadingMigratingComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ LoadingMigratingComponent ]
    })
    .compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(LoadingMigratingComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
