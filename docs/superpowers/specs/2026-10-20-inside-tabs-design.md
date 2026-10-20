# Inside the software: tabs (design)

Status: direction given by the user on 2026-10-20 ("my row, all tabs fixed, drop-down on hover, then a row with all open tabs, up to 10 at a time; no shortcut keys shown except in Help (F1)").

- **Row 1, fixed section tabs:** Home, Vouchers, Masters, Reports, Admin, and Help on the right. Hovering a section tab (or Enter / Down on the keyboard) opens a drop-down of its screens; a user only sees sections and screens their rights allow. Home and Help open directly.
- **Row 2, open screens:** each screen opened becomes a tab with a close button. At most 10 at once (Home is always available and does not count). Opening a screen that is already open switches to it. Opening an eleventh shows "10 screens are open. Close one to open another."
- **Background tabs stay alive:** their content is kept (a half-typed voucher waits) but hidden, and their keyboard shortcuts are switched off.
- **Closing:** the x button, or Ctrl+W. After closing, the most recently used tab shows, otherwise Home. Ctrl+Tab and Ctrl+Shift+Tab move between tabs. Esc never closes a tab.
- **No shortcut keys on screen:** no key hints on tabs, menus, buttons, hints or the palette. They are listed only in Help (F1). The keys themselves still work.
- **Look:** same palette as the login page: woven teal header, dark teal section row with the active tab in ivory under a gold line, ivory open-screens row.
