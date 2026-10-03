import { Routes } from '@angular/router';
import { Projects } from './components/projects/projects';
import { Dashboards } from './components/dashboards/dashboards';
import { NodesDashboard } from './components/dashboards/nodes-dashboard/nodes-dashboard';
import { PodsDashboard } from './components/dashboards/pods-dashboard/pods-dashboard';
import { DeploymentsDashboard } from './components/dashboards/deployments-dashboard/deployments-dashboard';
import { JobsDashboard } from './components/dashboards/jobs-dashboard/jobs-dashboard';
import { EventsDashboard } from './components/dashboards/events-dashboard/events-dashboard';
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
            children: [
                { path: '', pathMatch: 'full', redirectTo: 'nodes' },
                { path: 'nodes', component: NodesDashboard },
                { path: 'pods', component: PodsDashboard },
                { path: 'deployments', component: DeploymentsDashboard },
                { path: 'jobs', component: JobsDashboard },
                { path: 'events', component: EventsDashboard },
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
