# Phone home screen → device app

This is a fictional product story, not evidence of a real camera or mobile platform’s behavior. Service names, timing, data values, notification text, and the Homestead app are illustrative.

The same Device app panel stays in a phone frame throughout. `initial.phoneScreen` starts at home; steps explicitly open the app and return home. Notification dismissal is authored with `clear:true`, not inferred from opening the app. Recording starts hidden and becomes visible when ready; power and connection are later hidden without clearing their values. The final reopen preserves the current card set and recording value.

The diagram and phone follow the same seven steps. Home-screen icons are illustrative; story playback controls navigation. Optional source mapping is deliberately omitted.
