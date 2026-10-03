import { Component, signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatToolbarModule } from '@angular/material/toolbar';
import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';
import {MatListModule} from '@angular/material/list';
import {MatButtonModule} from '@angular/material/button';
import { Ilinks } from './interfaces/ilinks';

@Component({
  imports: [RouterOutlet, MatToolbarModule, MatIconModule, RouterLink, RouterLinkActive, MatListModule, MatButtonModule],
  selector: 'app-root',
  styleUrl: './app.scss',
  templateUrl: './app.html',
})
export class App {

  protected readonly links: Ilinks[] = [
    {
      path: "dashboards", label: "Dashboards"
    },
    {
      path: "projects", label: "Projects"
    }
  ]
}
