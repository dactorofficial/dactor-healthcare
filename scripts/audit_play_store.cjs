const fs = require('fs');

['clinic-app', 'patient-app'].forEach(app => {
  console.log('====================================');
  console.log('APP: ' + app);
  console.log('====================================');
  const manifestPath = app + '/app/src/main/AndroidManifest.xml';
  const gradlePath = app + '/app/build.gradle.kts';
  const proguardPath = app + '/app/proguard-rules.pro';
  
  if (fs.existsSync(manifestPath)) {
    const manifest = fs.readFileSync(manifestPath, 'utf8');
    const perms = manifest.match(/<uses-permission[^>]+>/g) || [];
    const features = manifest.match(/<uses-feature[^>]+>/g) || [];
    console.log('Permissions (' + perms.length + '):');
    perms.forEach(p => console.log('  ' + p.trim()));
    console.log('Features (' + features.length + '):');
    features.forEach(f => console.log('  ' + f.trim()));
  }
  
  if (fs.existsSync(gradlePath)) {
    const gradle = fs.readFileSync(gradlePath, 'utf8');
    const targetSdk = gradle.match(/targetSdk\s*=\s*(\d+)/);
    const minSdk = gradle.match(/minSdk\s*=\s*(\d+)/);
    const compileSdk = gradle.match(/compileSdk\s*=\s*(\d+)/);
    const vCode = gradle.match(/versionCode\s*=\s*(\d+)/);
    const vName = gradle.match(/versionName\s*=\s*"([^"]+)"/);
    const appId = gradle.match(/applicationId\s*=\s*"([^"]+)"/);
    console.log('Gradle config:');
    console.log('  applicationId: ' + (appId ? appId[1] : 'unknown'));
    console.log('  compileSdk: ' + (compileSdk ? compileSdk[1] : 'unknown'));
    console.log('  targetSdk: ' + (targetSdk ? targetSdk[1] : 'unknown'));
    console.log('  minSdk: ' + (minSdk ? minSdk[1] : 'unknown'));
    console.log('  versionCode: ' + (vCode ? vCode[1] : 'unknown'));
    console.log('  versionName: ' + (vName ? vName[1] : 'unknown'));
  }

  if (fs.existsSync(proguardPath)) {
    console.log('proguard-rules.pro size: ' + fs.statSync(proguardPath).size + ' bytes');
  } else {
    console.log('No proguard-rules.pro found');
  }
});
