import { TestBed } from '@angular/core/testing';
import { K8sResourcesApi } from './k8s-resources-api';

describe('K8sResourcesApi', () => {
  let service: K8sResourcesApi;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(K8sResourcesApi);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
