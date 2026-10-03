import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DeploymentsDashboard } from './deployments-dashboard';

describe('DeploymentsDashboard', () => {
  let component: DeploymentsDashboard;
  let fixture: ComponentFixture<DeploymentsDashboard>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DeploymentsDashboard],
    }).compileComponents();

    fixture = TestBed.createComponent(DeploymentsDashboard);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
