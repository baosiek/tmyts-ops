import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Dashboards } from './dashboards';

describe('Dashboards', () => {
  let component: Dashboards;
  let fixture: ComponentFixture<Dashboards>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Dashboards],
    }).compileComponents();

    fixture = TestBed.createComponent(Dashboards);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
