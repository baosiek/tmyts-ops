import { Routes } from '@angular/router';
import { Projects } from './components/projects/projects';
import { Dashboards } from './components/dashboards/dashboards';
import { Ui } from './components/projects/ui/ui';
import { Bot } from './components/projects/bot/bot';
import { Ibserver } from './components/projects/ibserver/ibserver';
import { Microservices } from './components/projects/microservices/microservices';
import { Trade } from './components/projects/trade/trade';

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
                    path: 'deployments/:namespace/:name/logs',
                    loadComponent: () =>
                        import('./components/dashboards/deployment-logs/deployment-logs').then((m) => m.DeploymentLogs),
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
                        children: [
                { path: '', pathMatch: 'full', redirectTo: 'ui' },
                { path: 'ui', component: Ui },
                { path: 'bot', component: Bot },
                { path: 'ibserver', component: Ibserver },
                { path: 'microservices', component: Microservices },
                { path: 'trade', component: Trade },
            ]
        }
];
