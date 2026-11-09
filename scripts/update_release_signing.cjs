const fs = require('fs');

['clinic-app/app/build.gradle.kts', 'patient-app/app/build.gradle.kts'].forEach(file => {
  let content = fs.readFileSync(file, 'utf8');

  // Replace signingConfigs and buildTypes
  const oldBlockRegex = /signingConfigs\s*\{[\s\S]*?buildTypes\s*\{[\s\S]*?signingConfig\s*=\s*signingConfigs\.getByName\("debug"\)[\s\S]*?\}\s*\}/;

  const newBlock = `signingConfigs {
        getByName("debug") {
            storeFile = file("keystores/debug.keystore")
            storePassword = "android"
            keyAlias = "androiddebugkey"
            keyPassword = "android"
        }
        create("release") {
            val uploadKeystore = file("keystores/dactor-upload.jks")
            if (uploadKeystore.exists()) {
                storeFile = uploadKeystore
                storePassword = "DactorUpload2026!"
                keyAlias = "dactor-upload"
                keyPassword = "DactorUpload2026!"
            } else {
                storeFile = file("keystores/debug.keystore")
                storePassword = "android"
                keyAlias = "androiddebugkey"
                keyPassword = "android"
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = signingConfigs.getByName("release")
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
    }`;

  if (oldBlockRegex.test(content)) {
    content = content.replace(oldBlockRegex, newBlock);
    fs.writeFileSync(file, content, 'utf8');
    console.log('Updated release signing config in ' + file);
  } else {
    console.log('Old signing block not matched in ' + file);
  }
});
