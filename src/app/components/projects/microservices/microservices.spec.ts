import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Microservices } from './microservices';

describe('Microservices', () => {
  let component: Microservices;
  let fixture: ComponentFixture<Microservices>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Microservices],
    }).compileComponents();

    fixture = TestBed.createComponent(Microservices);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
