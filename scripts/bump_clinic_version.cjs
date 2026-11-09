const fs = require('fs');

let c = fs.readFileSync('clinic-app/app/build.gradle.kts', 'utf8');
c = c.replace(/versionCode\s*=\s*\d+/, 'versionCode = 61');
c = c.replace(/versionName\s*=\s*"[^"]+"/, 'versionName = "1.0.60"');
fs.writeFileSync('clinic-app/app/build.gradle.kts', c, 'utf8');
console.log('Bumped clinic-app to versionCode 61, versionName 1.0.60');
