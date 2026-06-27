const mysql = require('mysql2/promise');
const config = require('./config');
async function main() {
  const pool = mysql.createPool(config.db);
  // Should fail since config is for Supabase now
  try {
    const [rows] = await pool.execute('SELECT * FROM xys_area');
    console.log(JSON.stringify(rows, null, 2));
  } catch(e) {
    console.log('MySQL error:', e.message);
    // Try the Supabase REST API
    const r = await fetch('https://txbrwudmvhrgfrsvaibc.supabase.co/rest/v1/xys_area?select=*', {
      headers: { 'apikey': process.env.SUPA_KEY, 'Authorization': `Bearer ${process.env.SUPA_KEY}` }
    });
    const data = await r.json();
    console.log(JSON.stringify(data, null, 2));
  }
  await pool.end().catch(()=>{});
}
main();
