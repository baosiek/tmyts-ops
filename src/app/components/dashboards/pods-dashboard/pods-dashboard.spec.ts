import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PodsDashboard } from './pods-dashboard';

describe('PodsDashboard', () => {
  let component: PodsDashboard;
  let fixture: ComponentFixture<PodsDashboard>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PodsDashboard],
    }).compileComponents();

    fixture = TestBed.createComponent(PodsDashboard);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
