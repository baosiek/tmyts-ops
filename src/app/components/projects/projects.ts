import { Component } from '@angular/core';
import {MatSidenavModule} from '@angular/material/sidenav';
import { Ilinks } from '../../interfaces/ilinks';
import { MatListModule } from '@angular/material/list';
import { RouterLinkActive, RouterLinkWithHref, RouterOutlet } from '@angular/router';

@Component({
  imports: [MatSidenavModule, MatListModule, RouterOutlet, RouterLinkWithHref, RouterLinkActive],
  selector: 'app-projects',
  styleUrl: './projects.scss',
  templateUrl: './projects.html',
})
export class Projects {
    protected readonly projectList: Ilinks[] = [
      {path: "ui", label: "UI"},
      {path: "bot", label: "Bot"},
      {path: "ibserver", label: "IB Server"},
      {path: "microservices", label: "Microservices"},
      {path: "trade", label: "Trade"},  
    ]
}
