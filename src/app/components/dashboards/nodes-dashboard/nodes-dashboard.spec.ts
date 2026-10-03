import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NodesDashboard } from './nodes-dashboard';

describe('NodesDashboard', () => {
  let component: NodesDashboard;
  let fixture: ComponentFixture<NodesDashboard>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [NodesDashboard],
    }).compileComponents();

    fixture = TestBed.createComponent(NodesDashboard);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
