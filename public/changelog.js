const CHANGELOG = [
  {
    v:'3.86', date:'August 2026',
    changes:[
      'Fixed a real bug: Results paginated correctly for an all-in-runout hand (everyone all-in, remaining streets auto-revealed), but a normal showdown that wasnt specifically flagged as a runout fell back to a different client-side function that rebuilt the results locally — and that fallback silently dropped the pot-layers data entirely, even though it was present on the server data it was building from. Multi-pot hands going through that path lost their Results pagination and showed the single-screen view with the nav bar hidden',
    ]
  },
  {
    v:'3.85', date:'August 2026',
    changes:[
      'Fixed a real bug: the Action Log modal was only ever showing the last 40 entries, because it read from the same lightweight slice thats sent with every routine state update. Scrolling to the bottom of the log looked like it had reached the start of the session but was actually just where the 40-entry window ran out, mid-hand. The modal now fetches the full log (up to 8,000 entries) on open, separate from the lightweight broadcast',
      'Blinds increase reminder now gets logged when it actually fires, not just shown as a popup',
      'Host changes to Game Info (buy-in, starting chips, blinds, blinds-increase settings, payouts) are now logged with the before/after values whenever the host edits them mid-session',
      'Initial Game Info is now logged too, right under "GAME BEGINS" — so the log has a complete record of what the game started with, not just what changed later',
    ]
  },
  {
    v:'3.84', date:'August 2026',
    changes:[
      'Fixed the changelog itself: v3.70–3.79 had a summary entry added on top, but the 10 individual entries underneath never actually got deleted — both were showing at once. Removed the redundant individual entries; the summary is the only one there now',
    ]
  },
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
