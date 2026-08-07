const CHANGELOG = [
  {
    v:'3.74', date:'August 2026',
    changes:[
      'Fixed the Call button showing an amount bigger than the players actual stack (e.g. "Call 590" when they only had 490 left) — it now clamps to whatever the player can actually put in, matching All In in that situation. This was diagnosed a few builds back but never actually shipped',
    ]
  },
  {
    v:'3.73', date:'August 2026',
    changes:[
      'Fixed a real bug: an all-in for LESS than the current bet was incorrectly reopening the action for everyone, including players who already had more in the pot than the all-in amount — e.g. a raiser bet 1900, an opponent went all-in for only 800, and the raiser was wrongly asked to "call" 0 chips. An all-in only reopens action now if it actually exceeds the standing bet (a real raise); an all-in for less is treated like a call, same as real poker rules',
    ]
  },
  {
    v:'3.72', date:'August 2026',
    changes:[
      'Fixed a real bug in High Card hand descriptions: "High Card — X" was showing whichever card happened to separate you from the closest peer hand (a genuine kicker position), not the hands actual highest card. A hand of A-K-Q-J-9 could read as "High Card — J" if J was the deciding card against an opponent, when it should always read "High Card — Ace". The winner determination itself was already correct — this was a display-only bug. Verified against the exact hand from the bug report',
    ]
  },
  {
    v:'3.71', date:'August 2026',
    changes:[
      'Side pots — Phase 3 (this is the one that actually changes behavior at the table): removed the live betting cap. Raise is limited only by the raisers own stack again, and All-In always pushes 100% of a players stack regardless of what anyone else has — a bigger stack can now bet past a shorter stack thats already all-in, and the pot correctly splits into a main pot and side pot at showdown (Phase 2)',
      'Raise panels Min/1/2 pot/Pot/Custom ceiling is back to just the acting players own stack, not the shortest stack at the table',
      'liveStackCap itself is unchanged and still used by the pot-splitting math — it just stopped being used to restrict betting',
      'This is the build to actually test the real scenario: a short stack all-in, a bigger stack betting past it, and confirming the side pot pays out correctly to the right players',
    ]
  },
  {
    v:'3.70', date:'August 2026',
    changes:[
      'Side pots — Phase 2 (the actual pot-splitting engine): showdown payouts are now computed per pot layer instead of one flat pot. A short all-in creates a main pot everyone eligible for, and further betting above that forms its own side pot only the bigger stacks can contest. Folded players contributions still count toward whichever layer they reached, they just cant win it back',
      'Unit-tested the layering math directly (three scenarios including the exact short-stack-all-in case from the earlier bug report) and ran a full hand through showdown to confirm ordinary single-pot hands pay out identically to before',
      'No visible change yet in normal play — the live betting cap from the earlier all-in fix is still active, so only one pot layer can actually form until that cap is relaxed in the next phase',
    ]
  },
  {
    v:'3.69', date:'August 2026',
    changes:[
      'Side pots — Phase 1 (foundation, no visible change yet): each player now has a handContributed field tracking total chips put into the pot across the whole hand, not just the current street. This is the data side pots will be built on top of — pot layering, per-pot eligibility, and the Results/UI work all come in later phases',
    ]
  },
  {
    v:'3.68', date:'August 2026',
    changes:[
      'Fixed a real money bug: an all-in was uncapped, so a bigger stack could push more than a shorter stack could ever match (e.g. shoving 5,360 against an opponent with only 640 total) — the pot ended up counting chips that were never actually contested. All-in now gets the same single-pot cap as raises, so nobody can ever commit more than the shortest live stack this hand',
      'Fixed auto-bust not firing when a player went to 0 chips via a Call rather than the All In button — a forced all-in-by-call was never being flagged as "all-in this hand," so it never showed up as bust-eligible. Both now count',
      'Results card now shows "Busted out (Nth place)" in place of the plain showdown ordinal (2nd/3rd/etc.) when that player is also getting eliminated this hand — those are two different things and busting is the more important one to show',
      '% gain re-added to the win log message (net stack change ÷ stack at the start of the hand), on both fold-win and showdown, including per-winner on split pots',
      'Draw hints (flush draw / straight draw) restored under Peek — the underlying function was still there, it just wasnt being called anymore after an earlier refactor',
      'Small Blind max validation raised from 100 to 500',
      'Changelog: v3.50–3.59 condensed into one summary entry, same as the earlier ranges',
    ]
  },
  {
    v:'3.67', date:'August 2026',
    changes:[
      'Fixed a real crash: raising with the Pot preset (or any raise where the player already had chips in for the street, e.g. the BB) threw a ReferenceError that crashed the entire server — every player got disconnected and the game ended. A variable was declared inside the wrong scope; moved it out so its still available where the raise popup needs it',
      'Changelog consolidated: versions before 3.50 condensed into a handful of summarized ranges instead of a full entry per version, and the whole changelog moved out of index.html into its own file (changelog.js), loaded only when you actually tap the version footer instead of on every page load',
    ]
  },
  {
    v:'3.66', date:'August 2026',
    changes:[
      'Bust-out log lines: removed the redundant "— all-in and lost" text and colored the line red (was white)',
      'Fixed the raise popup showing the chips-you-still-owe amount instead of the actual raise-to total — a re-raise to 50 that only cost you 30 more was showing "30", now correctly shows "50". Also restructured the popup to read as "[Name] / [PRESET] Re-Raises to / [total]" (e.g. "John / MIN Re-Raises to / 50") instead of splitting the preset label onto its own line',
      'Who Deals First screen: background is now solid black instead of a 92%-opacity black (the green card frame is unchanged), and the card image is 20% larger',
      'Fixed a real bug in Undo: the undo snapshot was being saved AFTER chips had already moved for the action, not before — so Undo was silently restoring the same post-action state instead of reverting it. This is why an all-in Undo looked like it did nothing. Snapshot now happens before any chip movement',
    ]
  },
  {
    v:'3.65', date:'August 2026',
    changes:[
      'Purple action popup now says "Raises to #" / "Re-Raises to #" instead of "Raised"/"Re-Raises", matching the raise-to model',
      'Undo button icon replaced with a plain white SVG arrow sized to match the other letters in that row — the old Unicode arrow character was rendering as a glossy color emoji icon on some phones instead of a plain glyph',
      'Custom button in the raise panel changed from green to a dimmed/darker purple with lighter purple text, matching the same muted-color treatment as Cancel',
      'Fixed extra dead space below the Fold/Call/Raise/All In/Undo/Deal row and below the raise-panel buttons — both were inheriting an 8px bottom margin meant for regular stacked buttons, which doubled up with the frames own padding',
      'Current Bet amounts and action tags (Raise/Call/Fold/etc.) now clear after a hand ends too, same as the cards',
    ]
  },
  {
    v:'3.64', date:'August 2026',
    changes:[
      'Default SB changed from 1 to 10 (BB from 2 to 20 to match)',
      'Current Bet header and amounts now both right-align to the actual right edge of the Action Log button, instead of the header being centered over a different point than the amounts',
      '1/2 pot and Pot raise presets fixed — they were computing toCall + pot instead of just the raw pot fraction, so they read high. Pot now equals the actual pot, 1/2 pot is half of it, and either dims/disables if it comes out below the legal minimum raise (can happen early) or above what you can afford',
      'Removed the "Your Turn"/"Raise" title text from inside the Fold/Call/Raise/All In row and the raise panel — this was already approved as a mockup earlier but never actually shipped. Frame/border stays since these hold multiple buttons; padding is now symmetric top/bottom to left/right since the title is gone',
    ]
  },
  {
    v:'3.63', date:'August 2026',
    changes:[
      'POT text checked — no actual font-family mismatch in the CSS; it already inherits the same sans-serif as the other headings, just larger/bolder/gold. Left as-is',
      'Current Bet amounts right-align edge shifted further right (Current Bet header stays where it was)',
      'D/SB/BB position badges switched from min-width to a shared fixed width so all three are exactly equal, not just D',
      'Removed the strikethrough on folded/busted player names — dimming plus the FOLD/BUST tag is enough',
      'Removed the skull icon from the "you have been busted out" banner',
    ]
  },
  {
    v:'3.62', date:'August 2026',
    changes:[
      'Raise changed from "raise-by" to "raise to" — Min/1/2 pot/Pot presets and the Custom input now represent the total you are raising to, not an increment on top of the call, and thats what gets sent to the server',
      'Minimum legal raise size is now enforced (silently clamped up if you try to raise below it, matching how the shortest-stack cap already works) — hardcoded to the current SB amount for now. This is meant to become a host setting in Game Info later (options: current SB / current BB / double BB / largest raise so far this street) but SB is the fixed choice until that setting exists',
    ]
  },
  {
    v:'3.61', date:'August 2026',
    changes:[
      'Removed the dark/gold frame from the single wide proceed buttons (Deal Next Hand, Deal the Flop/Turn/River, All-In -- Reveal Hands, Reveal Winner, Winner) — just the yellow button now, same height, full width matching the other popups. The framed Fold/Call/Raise/All In row and both raise-panel screens keep their frame since those hold multiple buttons',
      "\"Let's Show the Cards\" renamed to \"All-In -- Reveal Hands\"",
    ]
  },
  {
    v:'3.60', date:'August 2026',
    changes:[
      'Community/hole cards no longer sit stale on screen after a hand ends — cleared the moment stage goes idle (covers closing Results, auto-close, joining fresh, and after a game ends, since all four share that same idle state)',
      'Re-raises now say "Re-Raises" on the purple popup instead of "Raised", tracked per street',
      'Action log / hand log now show the real pot amount instead of a placeholder — % stack gain removed for now rather than showing a wrong number; the pieces to bring it back later (handStartStack per player) are already in place',
      'Raise presets (Min/1/2 pot/Pot) no longer shrink their amount to fit your stack — they show the true number and just dim/disable if you cant afford it. All In still covers "everything I have left"',
      'Current Bet header is now centered on the same edge the amounts right-align to, instead of also right-aligning to it',
      'Any player who goes all-in and does not win or split the pot is now busted out automatically. When more than one all-in loser busts from the same hand, the smallest original stack (at the start of that hand) busts first',
    ]
  },
  {
    v:'3.50–3.59', date:'August 2026',
    changes:[
      'First real chip/pot tracking built: player stacks, pot, and Current Bet became live numbers instead of placeholders, with blinds/calls/raises/all-ins and showdown payouts all moving real chips, plus a single-pot stand-in cap for side pots',
      'Raise redesigned twice — first from a raise-by increment to a raise-to total, then the popup/log text and minimum-raise enforcement caught up to match',
      'Fixed a real Undo bug: the snapshot was being saved after chips already moved, so Undo silently restored the same post-action state instead of reverting it',
      'Dealer Controls, seating list, and the single-CTA proceed buttons (Deal Next Hand, etc.) all got their frame/spacing/icon treatment reworked, and Card Ranks became Hand Ranks with a redesigned layout',
      'Action Log converted into its own popup modal',
    ]
  },
  {
    v:'3.40–3.49', date:'July–August 2026',
    changes:[
      'Raise popup consolidated into a single-row preset layout (Min/1/2 pot/Pot/Custom/Cancel) with immediate action on tap, replacing the old nested confirm-then-raise flow',
      'Chip stack display added under the All In button and in the action log',
      'Action colors unified across dealer controls, player action bar, and At the Table badges',
      'Numerous button-sizing, spacing, and alignment fixes across the raise panel and dealer controls ahead of real chip tracking',
    ]
  },
  {
    v:'3.30–3.39', date:'July 2026',
    changes:[
      'Stats expanded: win/loss streaks, Place column, session clock, Game Info section (buy-in, blinds, payouts), Just Ended snapshot',
      'Blinds-increase reminder redesigned (Same Dealer / Minutes / Hands modes) with an off-by-one bug fixed',
      'Action log color-coded by action type, moved into its own section, cap raised to 8,000 entries',
      'Card-back peek system (hold to view) and card face redesign for readability',
    ]
  },
  {
    v:'3.20–3.29', date:'July 2026',
    changes:[
      'All-In Runout mode introduced — remaining streets auto-play when everyone is all-in, with a leading-hand overlay and win-percentage display',
      'At the Table converted to a real HTML table for reliable column alignment (badge/name/action/bet/stack)',
      'Host Controls and Card Ranks/Stats consolidated into a shared button row',
      'Various dealer-controls and all-in-animation refinements',
    ]
  },
  {
    v:'3.10–3.19', date:'July 2026',
    changes:[
      'Dealer controls (Fold/Call/Raise/All In/Undo/Deal) built out as the hosts primary hand-running interface',
      'Card flip/deal animations and card-back styling established',
      'Action log introduced as a running record of every action in a hand',
    ]
  },
  {
    v:'3.0–3.9', date:'July 2025',
    changes:[
      'Initial release: real-time card dealing over Socket.IO, hand evaluation (best 5 of 7 cards), draw hints, collapsible hand-rankings cheat sheet, deployed via Railway',
    ]
  },
];
