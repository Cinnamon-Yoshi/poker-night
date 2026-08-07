const CHANGELOG = [
  {
    v:'3.83', date:'August 2026',
    changes:[
      'POT display: when a hand actually has more than one pot, the "Pot: X" text is replaced entirely with a pulsing gold "Side Pots" button instead of showing a combined total that implies one contestable pot. Ordinary single-pot hands still show the plain "Pot: X" as before',
      'Pot Breakdown modal now has a second section, "By Player", shown whenever there is more than one pot — each eligible players total potential winnings across everything they could still win, with a small white line-item breakdown underneath showing which specific pots make up that total',
    ]
  },
  {
    v:'3.82', date:'August 2026',
    changes:[
      'Changelog: v3.70–3.79 condensed into one summary entry, same treatment as the earlier ranges. Full detail now starts at v3.80',
    ]
  },
  {
    v:'3.81', date:'August 2026',
    changes:[
      'Changelog: v3.60–3.69 condensed into one summary entry, same treatment as the earlier ranges. Full detail now starts at v3.70',
    ]
  },
  {
    v:'3.80', date:'August 2026',
    changes:[
      'Fixed: a pot layer with only one eligible player (nobody left who could ever have matched that portion of a bet) is no longer shown or awarded as its own "pot" that persons hand happens to win — its now just returned to them directly, logged as an uncalled bet return. Applies everywhere pot layers show up: the live pot-breakdown modal, the Results screen pagination, and the hand log. The chips end up in the same place either way; this just stops a case where only one player was ever eligible from being presented as if it were a contested pot',
    ]
  },
  {
    v:'3.79', date:'August 2026',
    changes:[
      'Side pots — Phase 4b (plural Results screens): when a hand produces more than one pot, the Results screen is now paginated — each pot gets its own screen showing only the players eligible for it, with that pots own winner highlighted (a player can win one pot and not another). Prev/next arrows and a "Pot X of Y" indicator appear only when there is more than one pot; an ordinary single-pot hand looks exactly like it always has, no extra chrome',
      'Server now sends a compact per-layer summary (amount, winners, eligible players) alongside the existing results data, reusing the same computePotLayers() used for live payouts and the pot-breakdown modal — one source of truth for all three views',
      'This completes the planned side-pots visibility work: live tap-the-pot breakdown (4a) plus plural Results screens (4b)',
    ]
  },
  {
    v:'3.78', date:'August 2026',
    changes:[
      'Side pots — Phase 4a (live pot breakdown): the POT amount is now tappable during a hand, opening a full-screen list of every current pot layer (Main Pot + any Side Pots) and who is eligible to win each one. Uses the same live calculation the server already runs for showdown payouts, so it always matches what would actually be awarded if the hand ended right now. No cards involved, so its safe to check mid-hand',
      'This is the first half of the visible side-pots UI work — plural Results screens for multi-pot hands are next',
    ]
  },
  {
    v:'3.77', date:'August 2026',
    changes:[
      'Game Info approval: the host can now approve the terms on behalf of the whole table with one tap ("Approve for Everyone") instead of every player individually agreeing. The per-player "I Agree" flow still exists too — if the host doesnt use the shortcut, each player still confirms for themselves the way it worked before',
    ]
  },
  {
    v:'3.76', date:'August 2026',
    changes:[
      'Fixed a real bug: a Raise for more than the player could actually afford (typed a custom amount above their stack) was still treated as reopening action based on the amount they TYPED, not what they actually ended up putting in once it got capped to their real stack. So a raise that landed at, say, 500 against a standing bet of 700 (an effective all-in for less) incorrectly forced the original raiser to act again, same as the all-in-button bug fixed a few versions back — this was the same issue on the Raise path instead of the All In path',
    ]
  },
  {
    v:'3.75', date:'August 2026',
    changes:[
      'A Call or Raise that empties a players stack now displays as All In everywhere — the At the Table badge, the purple popup, and the action log — instead of showing whatever action they actually pressed. The badge fix re-evaluates on every render, so it stays correct through the flop/turn/river too, not just the street it happened on',
      'Fixed the blinds-increase reminder (both hands-based and minutes-based) firing after a hand that left only one player remaining — the game is effectively over at that point even before the host presses End Game, so theres no reason to prompt for a blind increase',
    ]
  },
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
    v:'3.70–3.79', date:'August 2026',
    changes:[
      'The full side-pots feature landed across this range: Phase 2 (the real pot-splitting payout engine) and Phase 3 (relaxing the live betting cap so a bigger stack can actually bet past a shorter stacks all-in) made the money math work correctly, then Phase 4a/4b built the visible pieces — a tappable live pot breakdown mid-hand, and paginated Results screens (Main Pot / Side Pot 1 / Side Pot 2...) once a hand actually produces more than one pot',
      'Several real bugs found and fixed via live testing along the way: an all-in for less than the standing bet was wrongly reopening action (both via the All In button and via an underfunded custom Raise), the Call button could show more than a players actual stack, a stack-emptying Call/Raise didnt always display as All In, High Card hand descriptions could show the wrong kicker as the "high card", and Undo was found to be silently a no-op for chips (fixed a few versions earlier in this same range)',
      'Also added: host can approve Game Info terms for the whole table with one tap instead of everyone confirming individually',
    ]
  },
  {
    v:'3.60–3.69', date:'August 2026',
    changes:[
      'Raise changed from raise-by to raise-to across the board, with minimum-legal-raise enforcement (silently clamped, hardcoded to SB for now — a host-configurable strategy is planned)',
      'A real crash fixed (a raise from a player already holding chips on the street threw a server-crashing ReferenceError) plus several UI/UX passes: single wide proceed buttons de-framed, raise popup phrasing and math corrected (raise-to total instead of the remaining cost), Current Bet alignment and D/SB/BB badge-width fixes, stale cards/bet-amounts/action-tags now clear when a hand ends, Undo fixed to snapshot before chip movement instead of after, auto-bust for any all-in loser (smallest original stack busts first), and % gain restored to the win log',
      'Foundational work for side pots started here — Phase 1 (per-hand contribution tracking) and Phase 2 (the actual pot-layering payout engine) both shipped in this range, though invisible until the live betting cap was relaxed in a later version',
      'Changelog consolidation began: versions before 3.50 condensed into summarized ranges and moved out of index.html into its own lazily-loaded file',
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
