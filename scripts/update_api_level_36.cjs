const fs = require('fs');

// 1. clinic-app build.gradle.kts
let gradle = fs.readFileSync('clinic-app/app/build.gradle.kts', 'utf8');
gradle = gradle.replace(/compileSdk\s*=\s*\d+/, 'compileSdk = 36');
gradle = gradle.replace(/targetSdk\s*=\s*\d+/, 'targetSdk = 36');
fs.writeFileSync('clinic-app/app/build.gradle.kts', gradle, 'utf8');
console.log('Updated clinic-app build.gradle.kts to compileSdk = 36, targetSdk = 36');

// 2. clinic-app AndroidManifest.xml
let manifest = fs.readFileSync('clinic-app/app/src/main/AndroidManifest.xml', 'utf8');
manifest = manifest.replace(/tools:targetApi="\d+"/, 'tools:targetApi="36"');
fs.writeFileSync('clinic-app/app/src/main/AndroidManifest.xml', manifest, 'utf8');
console.log('Updated clinic-app AndroidManifest.xml to tools:targetApi="36"');

// 3. patient-app build.gradle.kts & AndroidManifest.xml
let patientGradle = fs.readFileSync('patient-app/app/build.gradle.kts', 'utf8');
patientGradle = patientGradle.replace(/compileSdk\s*=\s*\d+/, 'compileSdk = 36');
patientGradle = patientGradle.replace(/targetSdk\s*=\s*\d+/, 'targetSdk = 36');
fs.writeFileSync('patient-app/app/build.gradle.kts', patientGradle, 'utf8');
console.log('Updated patient-app build.gradle.kts to compileSdk = 36, targetSdk = 36');

let patientManifest = fs.readFileSync('patient-app/app/src/main/AndroidManifest.xml', 'utf8');
patientManifest = patientManifest.replace(/tools:targetApi="\d+"/, 'tools:targetApi="36"');
fs.writeFileSync('patient-app/app/src/main/AndroidManifest.xml', patientManifest, 'utf8');
console.log('Updated patient-app AndroidManifest.xml to tools:targetApi="36"');
