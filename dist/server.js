"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const morgan_1 = __importDefault(require("morgan"));
const db_1 = require("./db");
const zod_1 = require("zod");
const app = (0, express_1.default)();
app.use((0, cors_1.default)());
app.use(express_1.default.json());
app.use((0, morgan_1.default)('dev'));
// Health
app.get('/health', (_req, res) => {
    res.json({ ok: true });
});
// Games CRUD
app.get('/games', (_req, res) => {
    const games = db_1.db.prepare('SELECT id, name, created_at, updated_at FROM games ORDER BY id').all();
    res.json(games);
});
app.post('/games', (req, res) => {
    const schema = zod_1.z.object({ name: zod_1.z.string().min(1) });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success)
        return res.status(400).json(parsed.error);
    try {
        const { name } = parsed.data;
        const info = db_1.db.prepare('INSERT INTO games (name) VALUES (?)').run(name);
        const gameId = Number(info.lastInsertRowid);
        // initialize balances for existing players
        const players = db_1.db.prepare('SELECT id FROM players').all();
        const insertBal = db_1.db.prepare('INSERT INTO balances (player_id, game_id, balance) VALUES (?, ?, 0)');
        const tx = db_1.db.transaction(() => {
            for (const p of players)
                insertBal.run(p.id, gameId);
        });
        tx();
        const game = db_1.db.prepare('SELECT id, name, created_at, updated_at FROM games WHERE id = ?').get(gameId);
        res.status(201).json(game);
    }
    catch (e) {
        if (String(e.message || '').includes('UNIQUE'))
            return res.status(409).json({ error: 'Game name must be unique' });
        res.status(500).json({ error: 'Failed to create game' });
    }
});
app.patch('/games/:id', (req, res) => {
    const schema = zod_1.z.object({ name: zod_1.z.string().min(1) });
    const id = Number(req.params.id);
    if (!Number.isInteger(id))
        return res.status(400).json({ error: 'Invalid id' });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success)
        return res.status(400).json(parsed.error);
    try {
        const { name } = parsed.data;
        const info = db_1.db.prepare('UPDATE games SET name = ? WHERE id = ?').run(name, id);
        if (info.changes === 0)
            return res.status(404).json({ error: 'Not found' });
        const game = db_1.db.prepare('SELECT id, name, created_at, updated_at FROM games WHERE id = ?').get(id);
        res.json(game);
    }
    catch (e) {
        if (String(e.message || '').includes('UNIQUE'))
            return res.status(409).json({ error: 'Game name must be unique' });
        res.status(500).json({ error: 'Failed to update game' });
    }
});
// Players
app.post('/players', (req, res) => {
    const schema = zod_1.z.object({ name: zod_1.z.string().min(1) });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success)
        return res.status(400).json(parsed.error);
    const { name } = parsed.data;
    try {
        const info = db_1.db.prepare('INSERT INTO players (name) VALUES (?)').run(name);
        const playerId = Number(info.lastInsertRowid);
        // initialize balances for all games
        const games = db_1.db.prepare('SELECT id FROM games').all();
        const insertBal = db_1.db.prepare('INSERT INTO balances (player_id, game_id, balance) VALUES (?, ?, 0)');
        const tx = db_1.db.transaction(() => {
            for (const g of games)
                insertBal.run(playerId, g.id);
        });
        tx();
        const player = db_1.db.prepare('SELECT id, name, archived, created_at, updated_at FROM players WHERE id = ?').get(playerId);
        res.status(201).json(player);
    }
    catch (e) {
        if (String(e.message || '').includes('UNIQUE'))
            return res.status(409).json({ error: 'Player name must be unique' });
        res.status(500).json({ error: 'Failed to create player' });
    }
});
app.get('/players', (_req, res) => {
    const players = db_1.db.prepare('SELECT id, name, archived, created_at, updated_at FROM players ORDER BY id').all();
    res.json(players);
});
app.patch('/players/:id/archive', (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id))
        return res.status(400).json({ error: 'Invalid id' });
    const schema = zod_1.z.object({ archived: zod_1.z.boolean() });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success)
        return res.status(400).json(parsed.error);
    const { archived } = parsed.data;
    const info = db_1.db.prepare('UPDATE players SET archived = ? WHERE id = ?').run(archived ? 1 : 0, id);
    if (info.changes === 0)
        return res.status(404).json({ error: 'Not found' });
    const player = db_1.db.prepare('SELECT id, name, archived, created_at, updated_at FROM players WHERE id = ?').get(id);
    res.json(player);
});
// Fetch balances for a player
app.get('/players/:id/balances', (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id))
        return res.status(400).json({ error: 'Invalid id' });
    const rows = db_1.db.prepare(`
		SELECT b.game_id, g.name as game_name, b.balance
		FROM balances b JOIN games g ON g.id = b.game_id
		WHERE b.player_id = ?
		ORDER BY b.game_id
	`).all(id);
    res.json(rows);
});
// Adjust balance (add or subtract)
app.post('/players/:id/adjust', (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id))
        return res.status(400).json({ error: 'Invalid id' });
    const schema = zod_1.z.object({
        gameId: zod_1.z.number().int().positive(),
        amount: zod_1.z.number().int().refine((n) => n !== 0, { message: 'Amount must be non-zero' }),
        note: zod_1.z.string().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success)
        return res.status(400).json(parsed.error);
    const { gameId, amount, note } = parsed.data;
    try {
        const tx = db_1.db.transaction(() => {
            const row = db_1.db.prepare('SELECT balance FROM balances WHERE player_id = ? AND game_id = ?').get(id, gameId);
            if (!row)
                throw new Error('Balance not found');
            const newBal = row.balance + amount;
            if (newBal < 0)
                throw new Error('Insufficient funds');
            db_1.db.prepare('UPDATE balances SET balance = ? WHERE player_id = ? AND game_id = ?').run(newBal, id, gameId);
            db_1.db.prepare('INSERT INTO ledger (player_id, type, source_game_id, destination_game_id, amount, note) VALUES (?, ?, ?, ?, ?, ?)')
                .run(id, 'adjust', amount < 0 ? gameId : gameId, null, Math.abs(amount), note || null);
        });
        tx();
        res.json({ ok: true });
    }
    catch (e) {
        const msg = String(e.message || '');
        if (msg === 'Insufficient funds' || msg === 'Balance not found')
            return res.status(400).json({ error: msg });
        res.status(500).json({ error: 'Failed to adjust balance' });
    }
});
// Transfer between sub-accounts
app.post('/players/:id/transfer', (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id))
        return res.status(400).json({ error: 'Invalid id' });
    const schema = zod_1.z.object({ fromGameId: zod_1.z.number().int().positive(), toGameId: zod_1.z.number().int().positive(), amount: zod_1.z.number().int().positive(), note: zod_1.z.string().optional() });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success)
        return res.status(400).json(parsed.error);
    const { fromGameId, toGameId, amount, note } = parsed.data;
    if (fromGameId === toGameId)
        return res.status(400).json({ error: 'from and to must differ' });
    try {
        const tx = db_1.db.transaction(() => {
            const from = db_1.db.prepare('SELECT balance FROM balances WHERE player_id = ? AND game_id = ?').get(id, fromGameId);
            const to = db_1.db.prepare('SELECT balance FROM balances WHERE player_id = ? AND game_id = ?').get(id, toGameId);
            if (!from || !to)
                throw new Error('Balance not found');
            if (from.balance < amount)
                throw new Error('Insufficient funds');
            db_1.db.prepare('UPDATE balances SET balance = ? WHERE player_id = ? AND game_id = ?').run(from.balance - amount, id, fromGameId);
            db_1.db.prepare('UPDATE balances SET balance = ? WHERE player_id = ? AND game_id = ?').run(to.balance + amount, id, toGameId);
            db_1.db.prepare('INSERT INTO ledger (player_id, type, source_game_id, destination_game_id, amount, note) VALUES (?, ?, ?, ?, ?, ?)')
                .run(id, 'transfer', fromGameId, toGameId, amount, note || null);
        });
        tx();
        res.json({ ok: true });
    }
    catch (e) {
        const msg = String(e.message || '');
        if (msg === 'Insufficient funds' || msg === 'Balance not found')
            return res.status(400).json({ error: msg });
        res.status(500).json({ error: 'Failed to transfer' });
    }
});
// Ledger history
app.get('/players/:id/ledger', (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id))
        return res.status(400).json({ error: 'Invalid id' });
    const rows = db_1.db.prepare(`
		SELECT l.id, l.type, l.source_game_id, sg.name AS source_game_name,
		       l.destination_game_id, dg.name AS destination_game_name,
		       l.amount, l.note, l.created_at
		FROM ledger l
		LEFT JOIN games sg ON sg.id = l.source_game_id
		LEFT JOIN games dg ON dg.id = l.destination_game_id
		WHERE l.player_id = ?
		ORDER BY l.id DESC
	`).all(id);
    res.json(rows);
});
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server listening on http://localhost:${PORT}`);
});
//# sourceMappingURL=server.js.map