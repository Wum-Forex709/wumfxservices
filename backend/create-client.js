// node create-client.js
const path = require('path');
const fs   = require('fs');

// Load sql.js directly
const initSqlJs = require('sql.js');

const DB_PATH = path.join(__dirname, 'database', 'knight_traders.db');

async function main() {
  const SQL = await initSqlJs();

  // Load existing DB file
  if (!fs.existsSync(DB_PATH)) {
    console.log('❌ Database file not found at:', DB_PATH);
    process.exit(1);
  }

  const fileBuffer = fs.readFileSync(DB_PATH);
  const db = new SQL.Database(fileBuffer);

  const bcrypt = require('bcryptjs');
  const hash   = bcrypt.hashSync('Client@123', 10);

  // Delete if exists
  db.run("DELETE FROM users WHERE email = 'client@test.com'");

  // Insert
  db.run(`
    INSERT INTO users
    (member_id, full_name, email, phone, password, role, status, ea_status,
     referral_code, agreement_signed, kyc_status)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)
  `, [
    'KT-00001', 'Ali Hassan', 'client@test.com', '0300-1234567',
    hash, 'user', 'active', 'inactive', 'KT-00001', 0, 'not_submitted'
  ]);

  // Verify in memory
  const res = db.exec("SELECT id, email FROM users WHERE email = 'client@test.com'");
  if (!res.length) {
    console.log('❌ Insert failed!');
    process.exit(1);
  }

  // Save to disk immediately
  const data = db.export();
  fs.writeFileSync(DB_PATH, Buffer.from(data));
  db.close();

  console.log('\n✅ Client created & saved to disk!\n');
  console.log('┌─────────────────────────────────┐');
  console.log('│  http://localhost:3000           │');
  console.log('│  Email:    client@test.com       │');
  console.log('│  Password: Client@123            │');
  console.log('└─────────────────────────────────┘\n');
  process.exit(0);
}

main().catch(e => { console.error('Error:', e.message); process.exit(1); });
