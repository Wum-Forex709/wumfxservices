const path = require('path');
const fs = require('fs');
const initSqlJs = require('sql.js');

const DB_PATH = path.join(__dirname, 'database', 'knight_traders.db');

async function main() {
  const SQL = await initSqlJs();
  const fileBuffer = fs.readFileSync(DB_PATH);
  const db = new SQL.Database(fileBuffer);

  const res = db.exec("SELECT id, email, role, status, password FROM users");
  
  if (!res.length) {
    console.log('❌ No users found!');
  } else {
    console.log('\n📋 Users in DB:\n');
    res[0].values.forEach(row => {
      console.log(`ID: ${row[0]} | ${row[1]} | ${row[2]} | ${row[3]}`);
      console.log(`   Password hash: ${row[4].substring(0,20)}...`);
    });
  }
  db.close();
  process.exit(0);
}
main().catch(e => { console.error(e.message); process.exit(1); });
