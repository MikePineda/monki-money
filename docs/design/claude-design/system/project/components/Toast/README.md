# Toast

Confirms what just happened. `surface-1`, 1px `line`, `elevation-2`, radius 12, at least 48px tall, docked 16px above the tab bar or the bottom button (under the top bar on screens with a keypad). Message in `body`, optional leading status icon, optional trailing link action in `accent`.

One at a time. Auto-dismiss after 5s, or 8s with "Deshacer". Enters with a 150ms fade and 8px rise; opacity only under reduced motion. Announce with `role="status"`.
