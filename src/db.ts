import Database from 'better-sqlite3'

const dbFile = process.env.DB_FILE || '/workspace/db/app.sqlite'
export const db = new Database(dbFile)

db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

db.exec(`
CREATE TABLE IF NOT EXISTS games (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	name TEXT NOT NULL UNIQUE,
	created_at TEXT NOT NULL DEFAULT (datetime('now')),
	updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS players (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	name TEXT NOT NULL UNIQUE,
	archived INTEGER NOT NULL DEFAULT 0,
	created_at TEXT NOT NULL DEFAULT (datetime('now')),
	updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Balances per player per game
CREATE TABLE IF NOT EXISTS balances (
	player_id INTEGER NOT NULL,
	game_id INTEGER NOT NULL,
	balance INTEGER NOT NULL DEFAULT 0,
	PRIMARY KEY (player_id, game_id),
	FOREIGN KEY(player_id) REFERENCES players(id) ON DELETE CASCADE,
	FOREIGN KEY(game_id) REFERENCES games(id) ON DELETE CASCADE
);

-- Ledger of all actions
CREATE TABLE IF NOT EXISTS ledger (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	player_id INTEGER NOT NULL,
	type TEXT NOT NULL, -- 'adjust' | 'transfer'
	source_game_id INTEGER,
	destination_game_id INTEGER,
	amount INTEGER NOT NULL,
	note TEXT,
	created_at TEXT NOT NULL DEFAULT (datetime('now')),
	FOREIGN KEY(player_id) REFERENCES players(id) ON DELETE CASCADE,
	FOREIGN KEY(source_game_id) REFERENCES games(id) ON DELETE SET NULL,
	FOREIGN KEY(destination_game_id) REFERENCES games(id) ON DELETE SET NULL
);

CREATE TRIGGER IF NOT EXISTS trg_players_updated
AFTER UPDATE ON players FOR EACH ROW
BEGIN
	UPDATE players SET updated_at = datetime('now') WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_games_updated
AFTER UPDATE ON games FOR EACH ROW
BEGIN
	UPDATE games SET updated_at = datetime('now') WHERE id = NEW.id;
END;
`)

// Seed default games A-H if not present
const existing = db.prepare('SELECT COUNT(1) AS c FROM games').get() as { c: number }
if (existing.c === 0) {
	const names = ['Game A','Game B','Game C','Game D','Game E','Game F','Game G','Game H']
	const insert = db.prepare('INSERT INTO games (name) VALUES (?)')
	const tx = db.transaction((arr: string[]) => {
		for (const n of arr) insert.run(n)
	})
	tx(names)
}

export function inTransaction<T>(fn: () => T): T {
	const tx = db.transaction(fn)
	return tx()
}