const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs"),
  os = require("os"),
  path = require("path");
const { execFile } = require("node:child_process");
const run = require("node:util").promisify(execFile);

test("a fresh instance restores login, wedding, receipts, private answers, signatures and inspection photos", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "rr-recovery-"));
  const env = {
    PATH: process.env.PATH,
    NODE_ENV: "production",
    JWT_SECRET: "recovery-synthetic-secret",
    DB_PATH: path.join(tmp, "source.db"),
    RECOVERY_DIR: tmp,
  };
  const cwd = path.join(__dirname, "..");
  try {
    await run(
      process.execPath,
      [
        "-e",
        `
      (async()=>{
        const db=require('./db'),fs=require('fs'),path=require('path');
        db.prepare("UPDATE users SET email='recovery@synthetic.invalid',password_hash=? WHERE id=1").run(require('bcryptjs').hashSync('SyntheticRecoveryOnly-2026',4));
        const id=db.prepare("INSERT INTO couples(partner1_name,partner2_name,email,status,wedding_date) VALUES('Synthetic','Recovery','couple@synthetic.invalid','booked','2027-07-10')").run().lastInsertRowid;
        db.prepare("INSERT INTO bookings(couple_id,event_date,end_date,package_name,guest_count,total_price) VALUES(?,'2027-07-09','2027-07-11','3-Day Weekend',85,1000)").run(id);
        const invoice=db.prepare("INSERT INTO invoices(couple_id,description,amount) VALUES(?,'Synthetic deposit',1000)").run(id).lastInsertRowid;
        require('./services/ledger').record(invoice,{amount:400,received_at:'2026-09-27',reference:'SYNTHETIC-recovery'},1);
        const contract=db.prepare("INSERT INTO contracts(couple_id,title,content,status,locked_at,signature_data,signer_name,signed_at) VALUES(?,'Synthetic signed agreement','Synthetic terms','signed',datetime('now'),'SYNTHETIC-TEST','Synthetic signer',datetime('now'))").run(id).lastInsertRowid;
        db.prepare("INSERT INTO contract_files(contract_id,filename,mime_type,size,data) VALUES(?,'synthetic.pdf','application/pdf',3,?)").run(contract,Buffer.from('pdf'));
        db.prepare("INSERT INTO event_operations(couple_id,details) VALUES(?,?)").run(id,JSON.stringify({readiness:'Synthetic insurance confirmed',camping:[{date:'2027-07-09',guests:20,tents:4,rvs:3}]}));
        const photo=db.prepare("INSERT INTO event_inspections(couple_id,stage,notes,mime_type,filename,photo) VALUES(?,'departure','Synthetic clear site','image/png','test.png',?)").run(id,Buffer.from('synthetic-photo')).lastInsertRowid;
        db.prepare("INSERT INTO damage_deposit_entries(couple_id,kind,amount_cents,reason,received_at) VALUES(?,'received',50000,'Synthetic security','2026-09-27')").run(id);
        const form=db.prepare("INSERT INTO forms(title) VALUES('Synthetic plan')").run().lastInsertRowid;
        const field=db.prepare("INSERT INTO form_fields(form_id,label,field_type,required) VALUES(?,'Guests','number',1)").run(form).lastInsertRowid;
        const assignment=db.prepare("INSERT INTO form_assignments(form_id,couple_id,status) VALUES(?,?,'completed')").run(form,id).lastInsertRowid;
        db.prepare('INSERT INTO form_responses(assignment_id,field_id,value) VALUES(?,?,?)').run(assignment,field,'85');
        const link=require('./services/forms').issueLink(assignment);
        fs.writeFileSync(path.join(process.env.RECOVERY_DIR,'ids.json'),JSON.stringify({id,contract,photo,invoice,token:link.token}));
        await db.backup(path.join(process.env.RECOVERY_DIR,'restored.db'));db.close();
      })().catch(e=>{console.error(e);process.exit(1)});
    `,
      ],
      { cwd, env, timeout: 15000 },
    );
    const result = await run(
      process.execPath,
      [
        "-e",
        `
      (async()=>{
        const assert=require('assert/strict'),fs=require('fs'),path=require('path');
        const ids=JSON.parse(fs.readFileSync(path.join(process.env.RECOVERY_DIR,'ids.json')));
        assert.equal(require('./services/verifyBackup').verifyBackup(process.env.DB_PATH).integrity,'ok');
        const express=require('express'),app=express();app.use(express.json());
        for(const n of ['auth','couples','contracts','forms','invoices'])app.use('/api/'+n,require('./routes/'+n));
        app.use('/api/operations',require('./routes/venueOperations'));
        const server=app.listen(0);await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port;
        const login=await fetch(base+'/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:'recovery@synthetic.invalid',password:'SyntheticRecoveryOnly-2026'})});assert.equal(login.status,200);const token=(await login.json()).token;
        const get=p=>fetch(base+p,{headers:{authorization:'Bearer '+token}});
        const wedding=await get('/api/couples/'+ids.id+'/overview');assert.equal(wedding.status,200);const w=await wedding.json();assert.equal(w.balance.paid,400);assert.equal((await (await get('/api/invoices/'+ids.invoice+'/payments')).json()).entries[0].reference,'SYNTHETIC-recovery');assert.equal(w.balance.balance,600);assert.equal(w.bookings[0].end_date,'2027-07-11');assert.equal(w.contracts[0].status,'signed');assert.equal((await (await get('/api/contracts/'+ids.contract)).json()).signature_data,'SYNTHETIC-TEST');
        const files=await (await get('/api/contracts/'+ids.contract+'/files')).json();const file=await get('/api/contracts/'+ids.contract+'/files/'+files[0].id);assert.equal(Buffer.from(await file.arrayBuffer()).toString(),'pdf');
        const form=await fetch(base+'/api/forms/public/'+ids.token);assert.equal(form.status,200);assert.equal((await form.json()).fields[0].value,'85');
        const ops=await (await get('/api/operations/'+ids.id)).json();assert.equal(ops.deposit.held,500);assert.equal(ops.details.camping[0].rvs,3);
        const photo=await get('/api/operations/'+ids.id+'/inspections/'+ids.photo+'/photo');assert.equal(Buffer.from(await photo.arrayBuffer()).toString(),'synthetic-photo');
        console.log('RESTORE_SMOKE_PASSED');server.close();server.closeAllConnections();require('./db').close();
      })().catch(e=>{console.error(e);process.exit(1)});
    `,
      ],
      {
        cwd,
        env: { ...env, DB_PATH: path.join(tmp, "restored.db") },
        timeout: 15000,
      },
    );
    assert.match(result.stdout, /RESTORE_SMOKE_PASSED/);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
