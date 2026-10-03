import { Component } from '@angular/core';
import {MatSidenavModule} from '@angular/material/sidenav';
import {MatListModule} from '@angular/material/list';
import { RouterOutlet, RouterLinkWithHref, RouterLinkActive } from '@angular/router';
import { Ilinks } from '../../interfaces/ilinks';

@Component({
  imports: [MatSidenavModule, MatListModule, RouterOutlet, RouterLinkWithHref, RouterLinkActive],
  selector: 'app-dashboards',
  styleUrl: './dashboards.scss',
  templateUrl: './dashboards.html',
})
export class Dashboards {
  protected readonly dashboardList: Ilinks[] = [
    {path: "nodes", label: "Nodes"},
    {path: "pods", label: "Pods"},
    {path: "deployments", label: "Deployments"},
    {path: "jobs", label: "Jobs"},
    {path: "events", label: "Events"},  
  ]
}
