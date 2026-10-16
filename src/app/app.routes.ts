import { Routes } from '@angular/router';
import { Projects } from './components/projects/projects';
import { Dashboards } from './components/dashboards/dashboards';

export const routes: Routes = [
        { path: '', pathMatch: 'full', redirectTo: 'dashboards' }, // Default landing page
        { 
            path: 'dashboards',
            component: Dashboards,
            // Each dashboard loads on demand, so heavy dependencies like ECharts stay
            // out of the initial bundle.
            children: [
                { path: '', pathMatch: 'full', redirectTo: 'nodes' },
                {
                    path: 'nodes',
                    loadComponent: () =>
                        import('./components/dashboards/nodes-dashboard/nodes-dashboard').then((m) => m.NodesDashboard),
                },
                {
                    path: 'pods',
                    loadComponent: () =>
                        import('./components/dashboards/pods-dashboard/pods-dashboard').then((m) => m.PodsDashboard),
                },
                {
                    path: 'deployments',
                    loadComponent: () =>
                        import('./components/dashboards/deployments-dashboard/deployments-dashboard').then((m) => m.DeploymentsDashboard),
                },
                {
                    path: 'statefulsets',
                    loadComponent: () =>
                        import('./components/dashboards/statefulsets-dashboard/statefulsets-dashboard').then((m) => m.StatefulSetsDashboard),
                },
                {
                    path: 'deployments/:namespace/:name/logs',
                    data: { type: 'Deployment' },
                    loadComponent: () =>
                        import('./components/dashboards/workload-logs/workload-logs').then((m) => m.WorkloadLogs),
                },
                {
                    path: 'statefulsets/:namespace/:name/logs',
                    data: { type: 'StatefulSet' },
                    loadComponent: () =>
                        import('./components/dashboards/workload-logs/workload-logs').then((m) => m.WorkloadLogs),
                },
                {
                    path: 'jobs',
                    loadComponent: () =>
                        import('./components/dashboards/jobs-dashboard/jobs-dashboard').then((m) => m.JobsDashboard),
                },
                {
                    path: 'jobs/:namespace/:job/logs',
                    loadComponent: () =>
                        import('./components/dashboards/job-logs/job-logs').then((m) => m.JobLogs),
                },
                {
                    path: 'events',
                    loadComponent: () =>
                        import('./components/dashboards/events-dashboard/events-dashboard').then((m) => m.EventsDashboard),
                },
            ]
        },
        { 
            path: 'projects', 
            component: Projects,
                        // One page per repository the server lists; the shell redirects to the first one.
            children: [
                {
                    path: ':repo',
                    loadComponent: () =>
                        import('./components/projects/project/project').then((m) => m.Project),
                },
            ]
        }
];
