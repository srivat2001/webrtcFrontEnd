import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Stacktrace } from './stacktrace';

describe('Stacktrace', () => {
  let component: Stacktrace;
  let fixture: ComponentFixture<Stacktrace>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Stacktrace]
    })
    .compileComponents();

    fixture = TestBed.createComponent(Stacktrace);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
