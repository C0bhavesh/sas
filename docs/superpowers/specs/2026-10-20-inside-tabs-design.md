# Inside the software: tabs (design)

Status: direction given by the user on 2026-10-20 ("my row, all tabs fixed, drop-down on hover, then a row with all open tabs, up to 10 at a time; no shortcut keys shown except in Help (F1)").

- **Row 1, fixed section tabs:** Home, Vouchers, Masters, Reports, Admin, and Help on the right. Hovering a section tab (or Enter / Down on the keyboard) opens a drop-down of its screens; a user only sees sections and screens their rights allow. Home and Help open directly.
- **Row 2, open screens:** each screen opened becomes a tab with a close button. At most 10 at once (Home is always available and does not count). Opening a screen that is already open switches to it. Opening an eleventh shows "10 screens are open. Close one to open another."
- **Background tabs stay alive:** their content is kept (a half-typed voucher waits) but hidden, and their keyboard shortcuts are switched off.
- **Closing:** the x button, or Ctrl+W. After closing, the most recently used tab shows, otherwise Home. Ctrl+Tab and Ctrl+Shift+Tab move between tabs. Esc never closes a tab.
- **No shortcut keys on screen:** no key hints on tabs, menus, buttons, hints or the palette. They are listed only in Help (F1). The keys themselves still work.
- **Look:** same palette as the login page: woven teal header, dark teal section row with the active tab in ivory under a gold line, ivory open-screens row.

## Quick row (added from the user's JSM screenshot)

A dark row under the section tabs, like JSM: `1 Sales, 2 Pur, 3 Rec, 4 Pay, Ledger, Z Trail, 5 M.Iss, 6 M.Rec, 7 J.Iss, 8 J.Rec, 9 Debt O/s, F10 Help`. The user chose to show the numbers on this row (the only place keys appear on screen). Digits work as Alt+digit (so typing a number in a field is never hijacked), Z Trail is Alt+Z, F10 opens Help; all are listed in Help. Receipt, Payment, Ledger, Trial Balance, Debtors O/s (ageing) and Help open their tabs. Sales, Purchase, Mill and Job-work issue/receive belong to later sub-projects: the buttons are shown (muted) and say "... will be available in a later stage". A button for a screen the user may not use is left out. The default Electron menu bar (File / Edit / View / Window) is removed.
