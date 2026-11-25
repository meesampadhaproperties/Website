const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

// Connection string comes ONLY from POSTGRES_URL (env or Website_CRM/.env.local). Never hardcode it.
function loadPostgresUrl() {
  if (process.env.POSTGRES_URL) return process.env.POSTGRES_URL;
  const envPath = path.resolve(__dirname, '..', '.env.local');
  if (!fs.existsSync(envPath)) return '';
  const line = fs.readFileSync(envPath, 'utf8').split('\n').find((l) => l.trim().startsWith('POSTGRES_URL='));
  return line ? line.slice(line.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '') : '';
}
const postgresUrl = loadPostgresUrl();
if (!postgresUrl) {
  console.error('POSTGRES_URL is not set (env or .env.local).');
  process.exit(1);
}
const connectionStrings = [postgresUrl];

const schemaPath = path.resolve(__dirname, '../../A_Requirements/supabase_schema.sql');
const sql = fs.readFileSync(schemaPath, 'utf8');

async function run() {
  let connected = false;
  let client;

  for (const connStr of connectionStrings) {
    console.log(`Attempting connection to: ${connStr.replace(/:[^:]*@/, ':****@')}`);
    client = new Client({
      connectionString: connStr,
      ssl: { rejectUnauthorized: false }
    });

    try {
      await client.connect();
      console.log('Connected successfully!');
      connected = true;
      break;
    } catch (err) {
      console.warn('Connection failed:', err.message);
      await client.end().catch(() => {});
    }
  }

  if (!connected) {
    console.error('All connection attempts failed.');
    process.exit(1);
  }

  try {
    console.log('Applying schema from supabase_schema.sql...');
    await client.query(sql);
    console.log('Schema applied successfully!\n');

    // Query tables created
    const res = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name;
    `);

    console.log('Public tables in database:');
    res.rows.forEach(r => console.log(' - ' + r.table_name));

    // Check roles
    const rolesRes = await client.query('SELECT name, id FROM public.roles;');
    console.log('\nDefault Roles:');
    rolesRes.rows.forEach(r => console.log(` - ${r.name} (${r.id})`));

    // Check lead statuses
    const statusesRes = await client.query('SELECT name, key FROM public.lead_statuses ORDER BY sort_order;');
    console.log('\nDefault Lead Statuses:');
    statusesRes.rows.forEach(r => console.log(` - ${r.name} (${r.key})`));

  } catch (err) {
    console.error('Error executing SQL:', err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

run();
