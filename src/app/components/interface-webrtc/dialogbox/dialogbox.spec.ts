import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Dialogbox } from './dialogbox';

describe('Dialogbox', () => {
  let component: Dialogbox;
  let fixture: ComponentFixture<Dialogbox>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Dialogbox]
    })
    .compileComponents();

    fixture = TestBed.createComponent(Dialogbox);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
