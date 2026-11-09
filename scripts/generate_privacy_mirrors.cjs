const fs = require('fs');
const path = require('path');

// Ensure directories exist
['web-app/public/privacy/clinic', 'web-app/public/privacy/patient', 'web-app/public/data-deletion'].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// 1. privacy-clinic -> privacy/clinic/index.html
let clinicHtml = fs.readFileSync('web-app/public/privacy-clinic.html', 'utf8');
clinicHtml = clinicHtml.replace(/href="\.\/app_logo/g, 'href="../../app_logo')
                       .replace(/src="\.\/app_logo/g, 'src="../../app_logo')
                       .replace(/href="\.\/privacy/g, 'href="../../privacy')
                       .replace(/href="\.\/data-deletion/g, 'href="../../data-deletion');
fs.writeFileSync('web-app/public/privacy/clinic/index.html', clinicHtml, 'utf8');
console.log('Generated web-app/public/privacy/clinic/index.html');

// 2. privacy-patient -> privacy/patient/index.html
let patientHtml = fs.readFileSync('web-app/public/privacy-patient.html', 'utf8');
patientHtml = patientHtml.replace(/href="\.\/app_logo/g, 'href="../../app_logo')
                         .replace(/src="\.\/app_logo/g, 'src="../../app_logo')
                         .replace(/href="\.\/privacy/g, 'href="../../privacy')
                         .replace(/href="\.\/data-deletion/g, 'href="../../data-deletion');
fs.writeFileSync('web-app/public/privacy/patient/index.html', patientHtml, 'utf8');
console.log('Generated web-app/public/privacy/patient/index.html');

// 3. privacy.html -> privacy/index.html
let privacyHub = fs.readFileSync('web-app/public/privacy.html', 'utf8');
privacyHub = privacyHub.replace(/href="\.\/app_logo/g, 'href="../app_logo')
                       .replace(/src="\.\/app_logo/g, 'src="../app_logo')
                       .replace(/href="\.\/privacy/g, 'href="../privacy')
                       .replace(/href="\.\/data-deletion/g, 'href="../data-deletion');
fs.writeFileSync('web-app/public/privacy/index.html', privacyHub, 'utf8');
console.log('Generated web-app/public/privacy/index.html');

// 4. data-deletion.html -> data-deletion/index.html
let dataDel = fs.readFileSync('web-app/public/data-deletion.html', 'utf8');
dataDel = dataDel.replace(/href="\.\/app_logo/g, 'href="../app_logo')
                 .replace(/src="\.\/app_logo/g, 'src="../app_logo')
                 .replace(/href="\.\/privacy/g, 'href="../privacy')
                 .replace(/href="\.\/data-deletion/g, 'href="../data-deletion');
fs.writeFileSync('web-app/public/data-deletion/index.html', dataDel, 'utf8');
console.log('Generated web-app/public/data-deletion/index.html');
