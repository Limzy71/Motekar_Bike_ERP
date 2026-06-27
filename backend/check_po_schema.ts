import mysql from 'mysql2/promise';

async function run() {
  const c = await mysql.createConnection({host:'localhost',user:'root',password:'',database:'motekar_db'});
  try {
    const [rows]: any = await c.query('DESCRIBE pengadaan_po_header');
    console.table(rows);
  } catch (e) {
    console.error(e);
  } finally {
    c.end();
  }
}
run();
