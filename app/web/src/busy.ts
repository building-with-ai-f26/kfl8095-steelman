// One busy state for every button that waits on Steelman (M3d-11, M-15):
// Create steelman, Download, Sign out, Delete account, the sign-in steps,
// Choose a username, the email-change steps, and the no-access card's Sign in
// with another account. Where a step has two such buttons, the one that waits
// shows it: Send a new code while a new code is on its way, and Sign in or
// Change email while the code is checked; both stay disabled meanwhile.
// The button can't be pressed again, as before, and it says it's working
// rather than unavailable: it keeps its full colour and a waiting cursor, and
// only if the answer takes longer than twice --sm-slow does it start to pulse
// slowly (app.css), so a quick answer shows nothing. GitHub's Primer, read
// live on Nov 25, gives a button a loading state in the same place, on the
// button itself, and shows nothing for a wait under about a second. The
// prototype's only busy look is the same gentle pulse, on its AI button.

/** What a button that's waiting on an answer has: `disabled`, and `data-busy` for its look. */
export function busyButton(busy: boolean): { disabled: boolean; "data-busy"?: "" } {
  return busy ? { disabled: true, "data-busy": "" } : { disabled: false };
}
