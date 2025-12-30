import { ComponentFixture, TestBed } from '@angular/core/testing';

import { HelperToolbox } from './helper-toolbox';

describe('HelperToolbox', () => {
  let component: HelperToolbox;
  let fixture: ComponentFixture<HelperToolbox>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HelperToolbox]
    })
    .compileComponents();

    fixture = TestBed.createComponent(HelperToolbox);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
