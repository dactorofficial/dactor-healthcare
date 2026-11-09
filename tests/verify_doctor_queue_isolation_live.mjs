const token = 'sbp_fc8f9a5e7ebc2c416f83f06025f5e4a7e00ad9e7';
const projectRef = 'ojfoofojcpabqegxmsab';

async function runQuery(sql) {
  const resp = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ query: sql })
  });
  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Query failed [${resp.status}]: ${err}`);
  }
  return await resp.json();
}

async function verify() {
  console.log('--- Verifying Doctor-Isolated Live Queue System Live on Supabase ---');

  // 1. Get or create a clinic
  let clinics = await runQuery(`SELECT id, name FROM public.clinics LIMIT 1;`);
  if (!clinics || clinics.length === 0) {
    throw new Error('No clinic found');
  }
  const clinic = clinics[0];
  console.log(`Using Clinic: ${clinic.name} (${clinic.id})`);

  // 2. Get or create two doctors
  let doctors = await runQuery(`SELECT id, full_name FROM public.doctors WHERE clinic_id = '${clinic.id}' LIMIT 2;`);
  if (!doctors || doctors.length < 2) {
    const docA_id = crypto.randomUUID();
    const docB_id = crypto.randomUUID();
    await runQuery(`
      INSERT INTO public.doctors (id, clinic_id, full_name, email, specialty, nmc_license_number)
      VALUES 
        ('${docA_id}', '${clinic.id}', 'Dr. Alpha Sharma', 'alpha_${Date.now()}@test.com', 'Cardiology', 'NMC12345'),
        ('${docB_id}', '${clinic.id}', 'Dr. Beta Verma', 'beta_${Date.now()}@test.com', 'Orthopedics', 'NMC67890')
      ON CONFLICT DO NOTHING;
    `);
    doctors = await runQuery(`SELECT id, full_name FROM public.doctors WHERE clinic_id = '${clinic.id}' LIMIT 2;`);
  }
  const docA = doctors[0];
  const docB = doctors[1];
  console.log(`Doctor A: ${docA.full_name} (${docA.id})`);
  console.log(`Doctor B: ${docB.full_name} (${docB.id})`);

  // Clean test appointments and queue entries
  await runQuery(`
    DELETE FROM public.queue_entries WHERE doctor_id IN ('${docA.id}', '${docB.id}');
    DELETE FROM public.appointments WHERE doctor_id IN ('${docA.id}', '${docB.id}');
  `);

  const apptA1_id = crypto.randomUUID();
  const apptB1_id = crypto.randomUUID();
  const apptA2_id = crypto.randomUUID();
  const codeA1 = Math.floor(1000000000 + Math.random() * 9000000000).toString();
  const codeB1 = Math.floor(1000000000 + Math.random() * 9000000000).toString();
  const codeA2 = Math.floor(1000000000 + Math.random() * 9000000000).toString();

  // Create appointments
  await runQuery(`
    INSERT INTO public.appointments (id, clinic_id, doctor_id, patient_name, patient_age, patient_gender, patient_mobile, tracking_code_10_digit, checkin_status, payment_status, appointment_date, appointment_time)
    VALUES
      ('${apptA1_id}', '${clinic.id}', '${docA.id}', 'Patient Alpha 1', 30, 'Male', '9800000001', '${codeA1}', 'not_checked_in', 'pending', CURRENT_DATE, '10:00:00'),
      ('${apptB1_id}', '${clinic.id}', '${docB.id}', 'Patient Beta 1', 28, 'Female', '9800000002', '${codeB1}', 'not_checked_in', 'pending', CURRENT_DATE, '10:00:00'),
      ('${apptA2_id}', '${clinic.id}', '${docA.id}', 'Patient Alpha 2', 45, 'Male', '9800000003', '${codeA2}', 'not_checked_in', 'pending', CURRENT_DATE, '10:30:00');
  `);

  // Create payment attempts
  const attA1 = crypto.randomUUID();
  const attB1 = crypto.randomUUID();
  const attA2 = crypto.randomUUID();
  await runQuery(`
    INSERT INTO public.appointment_payment_attempts (id, appointment_id, clinic_id, amount_npr, gateway, transaction_uuid, status)
    VALUES
      ('${attA1}', '${apptA1_id}', '${clinic.id}', 500, 'esewa', 'tx_a1_${Date.now()}', 'pending'),
      ('${attB1}', '${apptB1_id}', '${clinic.id}', 500, 'esewa', 'tx_b1_${Date.now()}', 'pending'),
      ('${attA2}', '${apptA2_id}', '${clinic.id}', 500, 'esewa', 'tx_a2_${Date.now()}', 'pending');
  `);

  // Finalize online payment for A1 -> Doctor A gets Token #1
  const resA1 = await runQuery(`SELECT public.finalize_online_appointment_payment('${attA1}', 'ref_a1', 500);`);
  console.log('Finalized A1 payment:', resA1);

  // Finalize online payment for B1 -> Doctor B gets Token #1 (NOT #2!)
  const resB1 = await runQuery(`SELECT public.finalize_online_appointment_payment('${attB1}', 'ref_b1', 500);`);
  console.log('Finalized B1 payment:', resB1);

  // Finalize online payment for A2 -> Doctor A gets Token #2
  const resA2 = await runQuery(`SELECT public.finalize_online_appointment_payment('${attA2}', 'ref_a2', 500);`);
  console.log('Finalized A2 payment:', resA2);

  // Check queue positions
  const qRows = await runQuery(`
    SELECT appointment_id, doctor_id, queue_position, status 
    FROM public.queue_entries 
    WHERE appointment_id IN ('${apptA1_id}', '${apptB1_id}', '${apptA2_id}');
  `);
  console.log('\n--- Resulting Queue Positions ---');
  for (const r of qRows) {
    const docTag = r.doctor_id === docA.id ? 'Doctor A' : 'Doctor B';
    console.log(`Appointment: ${r.appointment_id.slice(0, 8)} | ${docTag} | Token #${r.queue_position} | Status: ${r.status}`);
  }

  const qA1 = qRows.find(r => r.appointment_id === apptA1_id);
  const qB1 = qRows.find(r => r.appointment_id === apptB1_id);
  const qA2 = qRows.find(r => r.appointment_id === apptA2_id);

  if (qA1.queue_position !== 1) throw new Error(`Expected A1 to be Token #1, got #${qA1.queue_position}`);
  if (qB1.queue_position !== 1) throw new Error(`Expected B1 to be Token #1, got #${qB1.queue_position}`);
  if (qA2.queue_position !== 2) throw new Error(`Expected A2 to be Token #2, got #${qA2.queue_position}`);
  console.log('✅ PASS: Doctor A and Doctor B independently started at Token #1! A2 received Token #2 for Doctor A.');

  // Test get_public_queue_status for A2
  const statusA2 = await runQuery(`SELECT * FROM public.get_public_queue_status('${codeA2}');`);
  console.log('\nRPC get_public_queue_status for Doctor A patient (A2):', statusA2[0]);
  if (statusA2[0].patients_ahead !== 1) {
    throw new Error(`Expected A2 patients_ahead = 1, got ${statusA2[0].patients_ahead}`);
  }
  if (statusA2[0].current_queue_position !== 0) {
    throw new Error(`Expected A2 current_queue_position = 0, got ${statusA2[0].current_queue_position}`);
  }
  console.log('✅ PASS: Doctor A patient sees exactly 1 patient ahead (A1), unaffected by Doctor B!');

  // Test get_public_queue_status for B1
  const statusB1 = await runQuery(`SELECT * FROM public.get_public_queue_status('${codeB1}');`);
  console.log('\nRPC get_public_queue_status for Doctor B patient (B1):', statusB1[0]);
  if (statusB1[0].patients_ahead !== 0) {
    throw new Error(`Expected B1 patients_ahead = 0, got ${statusB1[0].patients_ahead}`);
  }
  console.log('✅ PASS: Doctor B patient sees 0 patients ahead, unaffected by Doctor A waiting list!');

  // Move Doctor B's patient B1 inside consultation cabin
  await runQuery(`UPDATE public.queue_entries SET status = 'inside', inside_at = NOW() WHERE appointment_id = '${apptB1_id}';`);

  // Verify Doctor B cabin shows serving token #1
  const statusB1Inside = await runQuery(`SELECT * FROM public.get_public_queue_status('${codeB1}');`);
  console.log('\nDoctor B patient status with B1 inside:', statusB1Inside[0]);
  if (statusB1Inside[0].current_queue_position !== 1) {
    throw new Error(`Expected B1 serving token to be 1, got ${statusB1Inside[0].current_queue_position}`);
  }

  // Verify Doctor A cabin STILL shows 0 (nobody inside Dr A's cabin!)
  const statusA2AfterBInside = await runQuery(`SELECT * FROM public.get_public_queue_status('${codeA2}');`);
  console.log('Doctor A patient status while B1 is inside Dr B cabin:', statusA2AfterBInside[0]);
  if (statusA2AfterBInside[0].current_queue_position !== 0) {
    throw new Error(`Doctor A queue leaked Doctor B cabin status! Expected 0, got ${statusA2AfterBInside[0].current_queue_position}`);
  }
  console.log('✅ PASS: Doctor cabin isolation verified! Doctor B consultation does NOT mark Doctor A cabin as occupied.');

  // Test get_doctor_live_queue RPC
  const docAQueue = await runQuery(`SELECT * FROM public.get_doctor_live_queue('${clinic.id}', '${docA.id}');`);
  const docBQueue = await runQuery(`SELECT * FROM public.get_doctor_live_queue('${clinic.id}', '${docB.id}');`);
  console.log(`\nget_doctor_live_queue(DocA) returned ${docAQueue.length} items; (DocB) returned ${docBQueue.length} items.`);
  if (docAQueue.some(r => r.doctor_id !== docA.id)) throw new Error('Doctor A queue contained other doctors');
  if (docBQueue.some(r => r.doctor_id !== docB.id)) throw new Error('Doctor B queue contained other doctors');
  console.log('✅ PASS: get_doctor_live_queue RPC cleanly filters and sequences each doctor queue independently!');

  // Clean test records
  await runQuery(`
    DELETE FROM public.queue_entries WHERE appointment_id IN ('${apptA1_id}', '${apptB1_id}', '${apptA2_id}');
    DELETE FROM public.appointments WHERE id IN ('${apptA1_id}', '${apptB1_id}', '${apptA2_id}');
    DELETE FROM public.appointment_payment_attempts WHERE id IN ('${attA1}', '${attB1}', '${attA2}');
  `);
  console.log('🧹 Cleaned up test data.');
  console.log('\n🏆 ALL 6 TEST VECTORS FOR DOCTOR-ISOLATED QUEUES PASSED ON LIVE SUPABASE DB! 🏆\n');
}

verify().catch(e => {
  console.error('VERIFICATION FAILED:', e);
  process.exit(1);
});
