const CHANGELOG = [
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
    v:'3.59', date:'August 2026',
    changes:[
      'Wired the UI to the real chip data from v3.57 — this is the part you can actually see and test now',
      'Call button amount now reads the real toCall minus what you have already put in this street, not a hardcoded 150',
      'Raise presets (Min/1/2 pot/Pot) now compute from the real pot and blinds, and are capped at the shortest live stack in the hand (silently, per the side-pot stand-in) — Custom input enforces the same cap',
      'Current Bet column now shows each players real streetBet instead of guessing from blind position',
      'Stack shown in At the Table now reflects real chip counts, going up and down as hands are played, instead of a static Starting Chips number',
      'Pot display now reads the real accumulated pot',
    ]
  },
  {
    v:'3.58', date:'August 2026',
    changes:[
      'Fixed the footer showing a stale version (3.47) while this popup showed the current one — the footer reads a separate VERSION/LAST_UPDATED constant in server.js that I had not been keeping in sync with the changelog. Both now match',
    ]
  },
  {
    v:'3.57', date:'August 2026',
    changes:[
      'First real chip/pot tracking: players now have an actual stack, deducted and paid out for real — blinds, calls, raises, all-ins, and showdown/fold-win payouts all move real chips server-side',
      'Pot is now computed from actual bets, not a placeholder number',
      'No side pots yet — every bet/raise this hand is silently capped at the shortest stack still live in the hand (recalculated as players fold), so nobody can commit more than the short stack could ever match. All-in for a smaller amount than the table is only being called for what the caller has, not what the raiser bet, may still show as a simple full call for now — side pots are a later feature',
      'This is server-side only in this version — the UI (Current Bet column, Call amount, raise presets, chip stacks shown) is still reading placeholder numbers and has not been rewired to the new real data yet. That is the next step',
    ]
  },
  {
    v:'3.56', date:'August 2026',
    changes:[
      'Shuffle animation title changed from "Dealer is shuffling…" to "Shuffling…"',
      'Removed the 5-card fan-out at the end of the shuffle animation',
      'Replaced it with a single card that grows and flies off the bottom of the screen, using the new Dealt Roatan Card artwork, as if being tossed at the player through the screen',
    ]
  },
  {
    v:'3.55', date:'August 2026',
    changes:[
      'Fixed Undo button in Dealer Controls being a fixed narrow width while Fold/Call/Raise/All In/Deal were flexible — all 6 buttons in that row are now equal width with even spacing',
    ]
  },
  {
    v:'3.54', date:'August 2026',
    changes:[
      'Fixed Current Bet values rendering in the wrong spot (overlapping the header) — the vertical position was being read via tr.offsetTop, which per spec resolves relative to the enclosing table rather than the positioned .section ancestor for statically-positioned elements inside a table. Switched to getBoundingClientRect for an accurate position',
      'Fixed action badges (Fold/Call/Raise/etc.) drifting right when a player wasnt also tagged OFFLINE — column was center-aligned, now left-aligned so every row lines up regardless of badge count',
      'Who Deals First animation no longer shows the "🎉 [name] deals first!" banner after landing on the winner — the highlighted row with the D badge already answers the question, so the extra restatement was cut. Same pause length before the modal closes',
    ]
  },
  {
    v:'3.53', date:'August 2026',
    changes:[
      'Added a Current Bet header/column to At the Table, styled to match the "At the Table" label with the same purple used for bet amounts',
      'Current Bet header and each row\'s bet amount are right-aligned to line up with the middle of the Action Log button below (independent of the table\'s own column widths, so it stays put regardless of name length or badge count)',
      'Bet amounts already use comma thousand separators via the existing chip formatter, so this holds once real bet tracking goes beyond blind-sized numbers',
    ]
  },
  {
    v:'3.52', date:'August 2026',
    changes:[
      'Standardized button height across the top nav row, Dealer Controls action row, and Deck/GAME/Seats row to match the Deck/GAME/Seats row height',
      'Top nav buttons now read Hand Ranks / Game Stats / Action Log on two lines, plus a new Dealer button (lock icon + label) in the 4th spot',
      'Dealer Controls action row (Fold/Call/Raise/All In/Undo/Deal-Flop-Turn-River-Win) simplified to icon-only — also fixed the Call/Check button always showing "C" even when checking, it now correctly shows "X" for check',
      'Deck/GAME/Seats icons removed; added a 4th Release button to exit Dealer Controls and require the PIN again',
      'Seating Order: pencil icon removed — tap a players name directly to rename. Added spacing between the bust-out star and the reorder arrows, and between the arrows and the remove (×) button',
    ]
  },
  {
    v:'3.51', date:'August 2026',
    changes:[
      'Top-left session clock/blinds now aligned with the section headings below it (was flush against the page edge, headings are inset by the section padding)',
      'Community / Your Cards / At the Table headings unified to the same size and weight — At the Table previously rendered larger',
      '"Card Ranks" renamed to "Hand Ranks" throughout',
      'Hand Ranks popup redesigned: card examples now right-aligned next to the hand name, kicker cards not part of the named hand are dimmed, and a centered gold divider (matching the Close button) separates each entry',
      'Action Log converted from an inline section into a full popup modal (matching Hand Ranks and Stats) — fixes the nested scroll-within-scroll and gives more room to read entries',
      'Button row is now 4 across: Hand Ranks / Stats / Log / Host. Icons dropped from the first three for space; Host is now icon-only',
    ]
  },
  {
    v:'3.50', date:'August 2026',
    changes:[
      'Standardized all 3 action-bar popups (Your Turn, Raise presets, Raise custom) to the same fixed button height, so the popup itself is now a consistent height across all three states',
      'Min/1/2 pot/Pot buttons recolored purple to match Confirm',
      'Chip amounts on Min/1/2 pot/Pot buttons now unbolded and smaller, matching the Call buttons style',
      'Cancel buttons on both raise screens now styled like the EXIT/LEAVE button (dusty red pill)',
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
