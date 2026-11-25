const https = require('https');

function callRpc(name, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = https.request({
      hostname: 'ojfoofojcpabqegxmsab.supabase.co',
      path: '/rest/v1/rpc/' + name,
      method: 'POST',
      headers: {
        'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9qZm9vZm9qY3BhYnFlZ3htc2FiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAzNTM1MTgsImV4cCI6MjEwNTkyOTUxOH0.pH1yOGykaaQTzlQxeCvcQ78HQwxhTSi4yA8JmvT-Y9Y',
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      }
    }, (res) => {
      let resBody = '';
      res.on('data', chunk => resBody += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body: resBody }));
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function getAppointments() {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'ojfoofojcpabqegxmsab.supabase.co',
      path: '/rest/v1/appointments?select=id,tracking_code_10_digit,appointment_date&limit=1',
      method: 'GET',
      headers: {
        'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9qZm9vZm9qY3BhYnFlZ3htc2FiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAzNTM1MTgsImV4cCI6MjEwNTkyOTUxOH0.pH1yOGykaaQTzlQxeCvcQ78HQwxhTSi4yA8JmvT-Y9Y',
        'Content-Type': 'application/json'
      }
    }, (res) => {
      let resBody = '';
      res.on('data', chunk => resBody += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body: resBody }));
    });
    req.on('error', reject);
    req.end();
  });
}

async function main() {
  console.log('Testing get_live_queue_status with dummy code 0000000000...');
  const r1 = await callRpc('get_live_queue_status', { p_code_or_id: '0000000000' });
  console.log('get_live_queue_status status:', r1.status);
  console.log('get_live_queue_status body:', r1.body);

  const apptsRes = await getAppointments();
  if (apptsRes.status === 200) {
    const appts = JSON.parse(apptsRes.body);
    if (appts && appts.length > 0) {
      const sampleCode = appts[0].tracking_code_10_digit || appts[0].id;
      console.log('Testing get_live_queue_status with real code:', sampleCode);
      const rReal = await callRpc('get_live_queue_status', { p_code_or_id: sampleCode });
      console.log('Real appointment queue response status:', rReal.status);
      console.log('Real appointment queue response body:', rReal.body);
    }
  }

  console.log('Testing get_public_queue_status with p_tracking_code...');
  const r_pub = await callRpc('get_public_queue_status', { p_tracking_code: '0000000000' });
  console.log('get_public_queue_status status:', r_pub.status);
  console.log('get_public_queue_status body:', r_pub.body);

  console.log('Testing repair_pay_at_desk_historical_bookings...');
  const r2 = await callRpc('repair_pay_at_desk_historical_bookings', {});
  console.log('repair_pay_at_desk_historical_bookings status:', r2.status);
  console.log('repair_pay_at_desk_historical_bookings body:', r2.body);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
