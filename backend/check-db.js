// Debug script - check database users
const { initDB, getDB } = require('./database/db');

async function main() {
  await initDB();
  const db = getDB();

  const users = db.prepare("SELECT id, member_id, full_name, email, role, status FROM users").all();
  
  console.log('\n📋 All users in database:\n');
  if (!users.length) {
    console.log('❌ NO USERS FOUND! Database is empty.\n');
  } else {
    users.forEach(u => {
      console.log(`ID: ${u.id} | ${u.email} | ${u.role} | ${u.status}`);
    });
  }
  console.log('');
  process.exit(0);
}

main().catch(e => { console.error(e.message); process.exit(1); });
