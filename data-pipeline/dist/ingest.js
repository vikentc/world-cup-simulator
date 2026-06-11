import axios from 'axios';
import * as cheerio from 'cheerio';
import pg from 'pg';
import dotenv from 'dotenv';
import { WC_NATIONS } from 'shared';
dotenv.config();
const { Pool } = pg;
const databaseUrl = process.env.DATABASE_URL;
async function runETL() {
    console.log('🏁 Starting FIFA World Cup 2026 Ingestion Pipeline...');
    let pool = null;
    if (databaseUrl) {
        pool = new Pool({ connectionString: databaseUrl });
    }
    // Phase 1: Fetch Elo Ratings from World Football Elo (Mocked scraper with real endpoints)
    console.log('📡 Fetching Elo Ratings from eloratings.net...');
    const scrapedElos = {};
    try {
        const response = await axios.get('https://www.eloratings.net/', { timeout: 8000 });
        const $ = cheerio.load(response.data);
        // Parse table rows and find country ratings
        $('tr').each((_, elem) => {
            const countryName = $(elem).find('a').first().text().trim();
            const ratingStr = $(elem).find('td').eq(3).text().trim();
            const rating = parseInt(ratingStr, 10);
            if (countryName && !isNaN(rating)) {
                // Map country names to ISO codes
                const match = WC_NATIONS.find((n) => n.name.toLowerCase() === countryName.toLowerCase());
                if (match) {
                    scrapedElos[match.id] = rating;
                    console.log(`  [ELO Scraper] Found ${match.name}: ELO ${rating}`);
                }
            }
        });
    }
    catch (err) {
        console.warn(`⚠️ Elo scraping failed (using default ELO seeds): ${err.message}`);
    }
    // Phase 2: Ingest StatsBomb Open Data (Example mapping player ratings from StatsBomb format)
    console.log('📡 Fetching StatsBomb open data schemas...');
    try {
        const sbResponse = await axios.get('https://raw.githubusercontent.com/statsbomb/open-data/master/data/competitions.json', { timeout: 8000 });
        if (Array.isArray(sbResponse.data)) {
            console.log(`  [StatsBomb API] Verified StatsBomb dataset connection. Found ${sbResponse.data.length} competitions.`);
        }
    }
    catch (err) {
        console.warn(`⚠️ StatsBomb Open Data connection check failed: ${err.message}`);
    }
    // Phase 3: Normalize and write to DB
    console.log('💾 Ingesting data into database...');
    if (pool) {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            for (const nation of WC_NATIONS) {
                const elo = scrapedElos[nation.id] || nation.elo;
                // Fetch current team data
                const res = await client.query('SELECT data FROM db_teams WHERE id = $1', [nation.id]);
                if (res.rows.length > 0) {
                    const team = res.rows[0].data;
                    // Update Elo and rankings
                    team.eloRating = elo;
                    await client.query('UPDATE db_teams SET data = $1 WHERE id = $2', [JSON.stringify(team), nation.id]);
                    console.log(`  Updated ${nation.name} ELO to ${elo} in DB.`);
                }
            }
            await client.query('COMMIT');
            console.log('✅ Ingestion Transaction Committed successfully.');
        }
        catch (err) {
            await client.query('ROLLBACK');
            console.error('❌ Ingestion Transaction Aborted:', err);
        }
        finally {
            client.release();
            await pool.end();
        }
    }
    else {
        console.warn('⚠️ No database connection found. Ingestion results saved locally to console.');
        console.log('Ingested Ratings Summary:', scrapedElos);
    }
    console.log('🎉 ETL Pipeline Completed.');
}
runETL().catch(console.error);
