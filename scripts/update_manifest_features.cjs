const fs = require('fs');

['clinic-app/app/src/main/AndroidManifest.xml', 'patient-app/app/src/main/AndroidManifest.xml'].forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  const featureBlock = [
    '    <!-- Google Play device compatibility: location hardware optional -->',
    '    <uses-feature android:name="android.hardware.location.gps" android:required="false" />',
    '    <uses-feature android:name="android.hardware.location.network" android:required="false" />'
  ].join('\n');

  if (!content.includes('android.hardware.location.gps')) {
    const marker = '<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />';
    if (content.includes(marker)) {
      content = content.replace(marker, marker + '\n\n' + featureBlock);
      fs.writeFileSync(file, content, 'utf8');
      console.log('Updated ' + file + ' with location uses-feature');
    } else {
      console.log('Marker not found in ' + file);
    }
  } else {
    console.log(file + ' already has location uses-feature');
  }
});
