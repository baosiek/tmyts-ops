import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Ibserver } from './ibserver';

describe('Ibserver', () => {
  let component: Ibserver;
  let fixture: ComponentFixture<Ibserver>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Ibserver],
    }).compileComponents();

    fixture = TestBed.createComponent(Ibserver);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
