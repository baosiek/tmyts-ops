import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CronJobsDashboard } from './cronjobs-dashboard';

describe('CronJobsDashboard', () => {
  let component: CronJobsDashboard;
  let fixture: ComponentFixture<CronJobsDashboard>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CronJobsDashboard],
    }).compileComponents();

    fixture = TestBed.createComponent(CronJobsDashboard);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
