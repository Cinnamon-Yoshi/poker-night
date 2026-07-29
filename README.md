# Poker Night - Card Dealer

A real-time card dealer for in-person Texas Hold'em. Your laptop/phone is the
host and runs the deck; everyone else's phone shows their own private hole
cards plus the shared board. Chips, bets, and pots are handled physically at
the table — this app only handles the cards.

## Setup (do this once, before Saturday if possible)

1. Install Node.js if you don't have it: https://nodejs.org (LTS version).
2. Unzip this project folder.
3. Open a terminal in the folder and run:
   ```
   npm install
   ```

## Running on game day

1. Make sure your host computer/phone and everyone's phones are on the
   **same WiFi network**.
2. In the project folder, run:
   ```
   npm start
   ```
3. The terminal will print something like:
   ```
   Poker dealer running. Open http://<this-computer-ip>:3000 on each device.
   ```
   Find your computer's local IP address (on Mac: System Settings > WiFi > Details;
   on Windows: `ipconfig` in Command Prompt, look for IPv4 Address).
4. On the **host device**, go to `http://<your-ip>:3000/host`.
5. On **every player's phone**, go to `http://<your-ip>:3000` and enter their name to join.

## Using it

- **Seating order**: On the host screen, use the up/down arrows next to each
  player's name to match how you're actually sitting around the table. This
  determines the dealer button and blind rotation — get this right before
  the first hand.
- **Deal New Hand**: shuffles, rotates the dealer button, deals 2 private
  cards to each player.
- **Reveal Flop / Turn / River**: advances the board, visible to everyone.
- **Advance Turn Manually**: moves the "whose turn" indicator to the next
  player who hasn't folded — click this as betting goes around the table.
- Each player can tap **Fold** on their own phone, which grays them out and
  skips them in the turn order.
- Each player's screen shows their current best hand and any draws they're
  chasing (flush draw, straight draw), plus a tappable hand-ranking cheat sheet.

## What this app does NOT do (by design)

Chips, betting amounts, pot size, side pots, and the elimination
leaderboard are all handled by you at the table, as you wanted. If you ever
want those added later, the groundwork (player list, turn order, dealer
button) is already there to build on.

## Known limitations

- This is built for a local network / in-person game, not internet-wide access.
- If the host device's browser is closed or refreshed, the game state stays
  on the server (the Node process) but the host page will need to be
  reopened at `/host`.
- If a player's phone disconnects, they're marked OFFLINE on the host
  screen but stay in the seating order — reconnecting (reopening the link
  and rejoining with the same name) will let them rejoin a future hand.
