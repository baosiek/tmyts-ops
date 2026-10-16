import { Component, inject, OnInit, signal } from '@angular/core';
import { MatListModule } from '@angular/material/list';
import { MatSidenavModule } from '@angular/material/sidenav';
import { Router, RouterLinkActive, RouterLinkWithHref, RouterOutlet } from '@angular/router';
import { finalize } from 'rxjs';
import { K8sResourcesApi } from '../../services/k8s-resources-api';

@Component({
  imports: [MatSidenavModule, MatListModule, RouterOutlet, RouterLinkWithHref, RouterLinkActive],
  selector: 'app-projects',
  styleUrl: './projects.scss',
  templateUrl: './projects.html',
})
export class Projects implements OnInit {
  private readonly api = inject(K8sResourcesApi);
  private readonly router = inject(Router);

  /** The repositories the server found, one sidenav entry each. */
  protected readonly projects = signal<string[]>([]);
  protected readonly loading = signal(true);
  protected readonly failed = signal(false);

  ngOnInit(): void {
    this.api
      .getProjects()
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: (projects) => {
          this.projects.set(projects);
          // On the bare /projects address, open the first project.
          const path = this.router.url.split(/[?#]/)[0].replace(/\/+$/, '');
          if (projects.length > 0 && path === '/projects') {
            void this.router.navigate(['/projects', projects[0]], { replaceUrl: true });
          }
        },
        error: () => this.failed.set(true),
      });
  }
}
