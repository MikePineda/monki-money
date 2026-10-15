import { Component } from '@angular/core'
import { RouterOutlet } from '@angular/router'

/**
 * Root shell. A placeholder until the design system and the app shell land;
 * the `app.shell` test id is what the E2E smoke test waits for.
 */
@Component({
  imports: [RouterOutlet],
  selector: 'app-root',
  styleUrl: './app.scss',
  templateUrl: './app.html',
})
export class App {}
