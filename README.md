# Player Management System (Express + SQLite)

Backend service for managing players with per-game balances across sub-games A–H. Supports creating players, archiving, creating/renaming games, adjusting balances, internal transfers, and a ledger of all actions.

## Tech
- Node.js, Express
- SQLite (better-sqlite3)
- TypeScript

## Setup
```bash
npm install
npm run build
npm start
# server runs at http://localhost:3000
```

For development (hot reload):
```bash
npm run watch
```

## API
- GET `/health`
- GET `/games`
- POST `/games` { name }
- PATCH `/games/:id` { name }

- GET `/players`
- POST `/players` { name }
- PATCH `/players/:id/archive` { archived: boolean }
- GET `/players/:id/balances`
- POST `/players/:id/adjust` { gameId, amount, note? }  // amount positive or negative, non-zero
- POST `/players/:id/transfer` { fromGameId, toGameId, amount, note? } // amount positive
- GET `/players/:id/ledger`

## Notes
- Player names are immutable after creation.
- Archiving a player toggles availability but keeps data intact.
- All adjustments and transfers are recorded in the ledger.
- New players are initialized with a 0 balance for all existing games.
- New games initialize a 0 balance for all existing players.