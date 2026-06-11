import pg from 'pg';
import dotenv from 'dotenv';
import { Team, Player, MatchSimulationState, TournamentState } from 'shared';
import { generateAllWorldCupTeams } from 'shared';

dotenv.config();

const { Pool } = pg;

// Database connection URL from environment, e.g. postgresql://user:pass@localhost:5432/db
const databaseUrl = process.env.DATABASE_URL;

let pool: pg.Pool | null = null;
let isPostgresReady = false;

// In-Memory Database Fallback Store
const memoryStore = {
  teams: {} as Record<string, Team>,
  matches: {} as Record<number, MatchSimulationState>,
  tournaments: {} as Record<number, TournamentState>,
  matchIdCounter: 1,
  tournamentIdCounter: 1,
};

// Seed in-memory store by default
const generatedTeams = generateAllWorldCupTeams();
Object.values(generatedTeams).forEach((team) => {
  memoryStore.teams[team.id] = team;
});

export async function initDatabase() {
  if (!databaseUrl) {
    console.warn('⚠️ No DATABASE_URL specified. Running with zero-config in-memory database fallback.');
    isPostgresReady = false;
    return;
  }

  try {
    pool = new Pool({
      connectionString: databaseUrl,
      connectionTimeoutMillis: 5000,
    });

    // Test connection
    const client = await pool.connect();
    console.log('✅ Connected to PostgreSQL database successfully.');
    client.release();

    isPostgresReady = true;
    await setupDbSchemas();
    await seedPostgresData();
  } catch (error) {
    console.error('❌ Failed to connect to PostgreSQL. Falling back to in-memory database.', error);
    isPostgresReady = false;
  }
}

async function setupDbSchemas() {
  if (!pool || !isPostgresReady) return;

  const client = await pool.connect();
  try {
    // Create necessary tables if not exist
    await client.query(`
      CREATE TABLE IF NOT EXISTS db_teams (
        id VARCHAR(5) PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        data JSONB NOT NULL
      );

      CREATE TABLE IF NOT EXISTS db_matches (
        id SERIAL PRIMARY KEY,
        home_team_id VARCHAR(5) NOT NULL,
        away_team_id VARCHAR(5) NOT NULL,
        status VARCHAR(20) NOT NULL,
        home_score INTEGER NOT NULL,
        away_score INTEGER NOT NULL,
        elapsed_seconds INTEGER NOT NULL,
        data JSONB NOT NULL
      );

      CREATE TABLE IF NOT EXISTS db_tournaments (
        id SERIAL PRIMARY KEY,
        name VARCHAR(150) NOT NULL,
        status VARCHAR(20) NOT NULL,
        current_round VARCHAR(50) NOT NULL,
        data JSONB NOT NULL
      );
    `);
    console.log('📋 Database schemas verified/created.');
  } catch (err) {
    console.error('Failed to setup db tables:', err);
  } finally {
    client.release();
  }
}

async function seedPostgresData() {
  if (!pool || !isPostgresReady) return;

  const client = await pool.connect();
  try {
    const res = await client.query('SELECT COUNT(*) FROM db_teams');
    const count = parseInt(res.rows[0].count, 10);
    
    if (count === 0) {
      console.log('🌱 Seeding database with 48 World Cup teams...');
      for (const team of Object.values(generatedTeams)) {
        await client.query(
          'INSERT INTO db_teams (id, name, data) VALUES ($1, $2, $3)',
          [team.id, team.name, JSON.stringify(team)]
        );
      }
      console.log('✅ Seed completed.');
    }
  } catch (err) {
    console.error('Failed to seed tables:', err);
  } finally {
    client.release();
  }
}

// --- DB Operations API ---

export async function getTeams(): Promise<Team[]> {
  if (isPostgresReady && pool) {
    try {
      const res = await pool.query('SELECT data FROM db_teams ORDER BY name ASC');
      return res.rows.map(row => row.data as Team);
    } catch (e) {
      console.error('PG getTeams failed, reading from memory fallback', e);
    }
  }
  return Object.values(memoryStore.teams).sort((a, b) => a.name.localeCompare(b.name));
}

export async function getTeamById(id: string): Promise<Team | null> {
  if (isPostgresReady && pool) {
    try {
      const res = await pool.query('SELECT data FROM db_teams WHERE id = $1', [id]);
      if (res.rows.length > 0) return res.rows[0].data as Team;
      return null;
    } catch (e) {
      console.error('PG getTeamById failed, reading from memory fallback', e);
    }
  }
  return memoryStore.teams[id] || null;
}

export async function saveMatch(match: MatchSimulationState): Promise<MatchSimulationState> {
  if (isPostgresReady && pool) {
    try {
      if (match.matchId === 0 || !match.matchId) {
        // Insert new match
        const res = await pool.query(
          `INSERT INTO db_matches (home_team_id, away_team_id, status, home_score, away_score, elapsed_seconds, data)
           VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
          [
            match.homeTeam.id,
            match.awayTeam.id,
            match.status,
            match.homeScore,
            match.awayScore,
            Math.round(match.elapsedSeconds),
            JSON.stringify(match),
          ]
        );
        match.matchId = res.rows[0].id;
      } else {
        // Update existing match
        await pool.query(
          `UPDATE db_matches SET status = $1, home_score = $2, away_score = $3, elapsed_seconds = $4, data = $5
           WHERE id = $6`,
          [
            match.status,
            match.homeScore,
            match.awayScore,
            Math.round(match.elapsedSeconds),
            JSON.stringify(match),
            match.matchId,
          ]
        );
      }
      return match;
    } catch (e) {
      console.error('PG saveMatch failed, updating memory fallback', e);
    }
  }

  // Memory fallback
  if (match.matchId === 0 || !match.matchId) {
    match.matchId = memoryStore.matchIdCounter++;
  }
  memoryStore.matches[match.matchId] = { ...match };
  return match;
}

export async function getMatchById(id: number): Promise<MatchSimulationState | null> {
  if (isPostgresReady && pool) {
    try {
      const res = await pool.query('SELECT data FROM db_matches WHERE id = $1', [id]);
      if (res.rows.length > 0) return res.rows[0].data as MatchSimulationState;
      return null;
    } catch (e) {
      console.error('PG getMatchById failed, reading memory fallback', e);
    }
  }
  return memoryStore.matches[id] || null;
}

export async function saveTournament(tournament: TournamentState): Promise<TournamentState> {
  if (isPostgresReady && pool) {
    try {
      if (tournament.id === 0 || !tournament.id) {
        const res = await pool.query(
          `INSERT INTO db_tournaments (name, status, current_round, data)
           VALUES ($1, $2, $3, $4) RETURNING id`,
          [
            tournament.name,
            tournament.status,
            tournament.currentRound,
            JSON.stringify(tournament),
          ]
        );
        tournament.id = res.rows[0].id;
      } else {
        await pool.query(
          `UPDATE db_tournaments SET status = $1, current_round = $2, data = $3
           WHERE id = $4`,
          [
            tournament.status,
            tournament.currentRound,
            JSON.stringify(tournament),
            tournament.id,
          ]
        );
      }
      return tournament;
    } catch (e) {
      console.error('PG saveTournament failed, updating memory fallback', e);
    }
  }

  // Memory fallback
  if (tournament.id === 0 || !tournament.id) {
    tournament.id = memoryStore.tournamentIdCounter++;
  }
  memoryStore.tournaments[tournament.id] = { ...tournament };
  return tournament;
}

export async function getTournamentById(id: number): Promise<TournamentState | null> {
  if (isPostgresReady && pool) {
    try {
      const res = await pool.query('SELECT data FROM db_tournaments WHERE id = $1', [id]);
      if (res.rows.length > 0) return res.rows[0].data as TournamentState;
      return null;
    } catch (e) {
      console.error('PG getTournamentById failed, reading memory fallback', e);
    }
  }
  return memoryStore.tournaments[id] || null;
}
