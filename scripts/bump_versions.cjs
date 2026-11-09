const fs = require('fs');

// 1. Clinic App
let clinicGradle = fs.readFileSync('clinic-app/app/build.gradle.kts', 'utf8');
clinicGradle = clinicGradle.replace(/versionCode\s*=\s*\d+/, 'versionCode = 60');
clinicGradle = clinicGradle.replace(/versionName\s*=\s*"[^"]+"/, 'versionName = "1.0.59"');
fs.writeFileSync('clinic-app/app/build.gradle.kts', clinicGradle, 'utf8');
console.log('Bumped clinic-app to versionCode: 60, versionName: 1.0.59');

// 2. Patient App
let patientGradle = fs.readFileSync('patient-app/app/build.gradle.kts', 'utf8');
patientGradle = patientGradle.replace(/versionCode\s*=\s*\d+/, 'versionCode = 86');
patientGradle = patientGradle.replace(/versionName\s*=\s*"[^"]+"/, 'versionName = "1.0.74"');
fs.writeFileSync('patient-app/app/build.gradle.kts', patientGradle, 'utf8');
console.log('Bumped patient-app to versionCode: 86, versionName: 1.0.74');
