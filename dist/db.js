"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.db = void 0;
exports.inTransaction = inTransaction;
const better_sqlite3_1 = __importDefault(require("better-sqlite3"));
exports.db = new better_sqlite3_1.default('/workspace/db/app.sqlite');
exports.db.pragma('journal_mode = WAL');
exports.db.exec(`
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
`);
// Seed default games A-H if not present
const existing = exports.db.prepare('SELECT COUNT(1) AS c FROM games').get();
if (existing.c === 0) {
    const names = ['Game A', 'Game B', 'Game C', 'Game D', 'Game E', 'Game F', 'Game G', 'Game H'];
    const insert = exports.db.prepare('INSERT INTO games (name) VALUES (?)');
    const tx = exports.db.transaction((arr) => {
        for (const n of arr)
            insert.run(n);
    });
    tx(names);
}
function inTransaction(fn) {
    const tx = exports.db.transaction(fn);
    return tx();
}
//# sourceMappingURL=db.js.map