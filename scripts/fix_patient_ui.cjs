const fs = require('fs');
const path = require('path');

// 1. Fix ClinicDetailScreen.kt
const clinicDetailPath = path.join(__dirname, '../patient-app/app/src/main/java/com/dactor/patient/ui/discovery/ClinicDetailScreen.kt');
let clinicDetail = fs.readFileSync(clinicDetailPath, 'utf8');

// Target 1: Clinic Header & Specialties
const oldHeaderRegex = /Column\(verticalArrangement = Arrangement\.spacedBy\(3\.dp\)\)\s*\{\s*Text\(\s*text = clinicName,[\s\S]*?\/\/ Specialties tags[\s\S]*?specialties\.take\(2\)\.forEach[\s\S]*?\}\s*\}\s*\}\s*\}\s*\}\s*\/\/ Call Button Card on right[\s\S]*?dialNumber\(phone\)[\s\S]*?\}\s*\}\s*\}/;

const newHeader = `Column(
                                        modifier = Modifier.weight(1f).padding(end = 8.dp),
                                        verticalArrangement = Arrangement.spacedBy(3.dp)
                                    ) {
                                        Text(
                                            text = clinicName,
                                            fontWeight = FontWeight.Bold,
                                            fontSize = 19.sp,
                                            color = Color(0xFF0F172A)
                                        )
                                        Row(
                                            verticalAlignment = Alignment.CenterVertically,
                                            horizontalArrangement = Arrangement.spacedBy(4.dp)
                                        ) {
                                            Icon(Icons.Default.LocationOn, contentDescription = null, tint = Color(0xFF00796B), modifier = Modifier.size(15.dp))
                                            Text(
                                                text = address,
                                                fontSize = 12.sp,
                                                color = Color(0xFF64748B),
                                                maxLines = 2,
                                                overflow = TextOverflow.Ellipsis
                                            )
                                        }
                                    }
                                }

                                // Call Button Card on right
                                Surface(
                                    shape = RoundedCornerShape(12.dp),
                                    color = Color(0xFFE6F4F1),
                                    border = BorderStroke(1.dp, Color(0xFF00796B).copy(alpha = 0.3f)),
                                    modifier = Modifier.clickable { dialNumber(phone) }
                                ) {
                                    Row(
                                        modifier = Modifier.padding(horizontal = 10.dp, vertical = 8.dp),
                                        verticalAlignment = Alignment.CenterVertically,
                                        horizontalArrangement = Arrangement.spacedBy(6.dp)
                                    ) {
                                        Icon(Icons.Default.Phone, contentDescription = null, tint = Color(0xFF00796B), modifier = Modifier.size(16.dp))
                                        Column {
                                            Text("Call", fontSize = 11.sp, fontWeight = FontWeight.Bold, color = Color(0xFF00796B))
                                            Text(phone.take(13), fontSize = 10.sp, color = Color(0xFF00796B))
                                        }
                                    }
                                }
                            }

                            // Full-width wrapping specialties tags (Prevents vertical text squishing)
                            @OptIn(ExperimentalLayoutApi::class)
                            FlowRow(
                                horizontalArrangement = Arrangement.spacedBy(8.dp),
                                verticalArrangement = Arrangement.spacedBy(6.dp),
                                modifier = Modifier.fillMaxWidth().padding(top = 2.dp)
                            ) {
                                specialties.forEach { spec ->
                                    Surface(
                                        shape = RoundedCornerShape(12.dp),
                                        color = Color(0xFFE6F4F1)
                                    ) {
                                        Text(
                                            text = spec,
                                            fontSize = 11.5.sp,
                                            fontWeight = FontWeight.Medium,
                                            color = Color(0xFF00796B),
                                            modifier = Modifier.padding(horizontal = 10.dp, vertical = 5.dp),
                                            maxLines = 1,
                                            softWrap = false
                                        )
                                    }
                                }
                            }`;

if (oldHeaderRegex.test(clinicDetail)) {
    clinicDetail = clinicDetail.replace(oldHeaderRegex, newHeader);
    console.log('✅ Replaced Clinic Header & Specialties with full-width FlowRow');
} else {
    console.warn('⚠️ Could not match oldHeaderRegex in ClinicDetailScreen.kt');
}

// Target 2: Consulting Doctor Name & Specialties
const oldDocRegex = /Text\(\s*"Dr\.\s*\$\{docToDisplay\.fullName\.removePrefix\("Dr\."\)\.removePrefix\("dr\."\)\.trim\(\)\}",[\s\S]*?docToDisplay\.specialty\?\.ifBlank[\s\S]*?color = Color\(0xFF00796B\)\s*\)/;

const newDoc = `val cleanDocName = docToDisplay.fullName.replace(Regex("^(?i)dr\\\\.?\\\\s*"), "").trim()
                                        .split(" ").filter { it.isNotBlank() }
                                        .joinToString(" ") { it.replaceFirstChar { c -> c.uppercase() } }
                                    Text(
                                        "Dr. $cleanDocName",
                                        fontWeight = FontWeight.Bold,
                                        fontSize = 15.sp,
                                        color = Color(0xFF0F172A)
                                    )
                                    if (!docToDisplay.education.isNullOrBlank()) {
                                        Text(
                                            docToDisplay.education,
                                            fontSize = 11.sp,
                                            color = Color(0xFF64748B)
                                        )
                                    }
                                    val docSpecs = remember(docToDisplay) {
                                        (listOfNotNull(docToDisplay.specialty?.takeIf { it.isNotBlank() }) + docToDisplay.specialties)
                                            .distinct()
                                            .ifEmpty { listOf("Medical Specialist") }
                                    }
                                    Text(
                                        docSpecs.joinToString(", "),
                                        fontSize = 11.sp,
                                        fontWeight = FontWeight.Medium,
                                        color = Color(0xFF00796B)
                                    )`;

if (oldDocRegex.test(clinicDetail)) {
    clinicDetail = clinicDetail.replace(oldDocRegex, newDoc);
    console.log('✅ Fixed Consulting Doctor name (no double Dr) and full specialties list');
} else {
    console.warn('⚠️ Could not match oldDocRegex in ClinicDetailScreen.kt');
}

// Target 3: Get Directions Button
const oldAddressRegex = /\/\/\s*Address\s*Row\(\s*modifier = Modifier\.fillMaxWidth\(\)[\s\S]*?Icon\(Icons\.Default\.Place[\s\S]*?Text\(address,[\s\S]*?Text\(\s*"Get Directions"[\s\S]*?openMaps\(address\)[\s\S]*?\}\s*\)/;

const newAddress = `// Address with non-squishing Directions pill
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Row(
                                    modifier = Modifier.weight(1f).padding(end = 10.dp),
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                                ) {
                                    Icon(Icons.Default.Place, contentDescription = null, tint = Color(0xFF64748B), modifier = Modifier.size(16.dp))
                                    Text(
                                        text = address,
                                        fontSize = 12.sp,
                                        color = Color(0xFF0F172A),
                                        maxLines = 2,
                                        overflow = TextOverflow.Ellipsis
                                    )
                                }
                                Surface(
                                    shape = RoundedCornerShape(10.dp),
                                    color = Color(0xFFE6F4F1),
                                    border = BorderStroke(1.dp, Color(0xFF00796B).copy(alpha = 0.2f)),
                                    modifier = Modifier.clickable { openMaps(address) }
                                ) {
                                    Row(
                                        modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp),
                                        verticalAlignment = Alignment.CenterVertically,
                                        horizontalArrangement = Arrangement.spacedBy(4.dp)
                                    ) {
                                        Icon(Icons.Default.Directions, contentDescription = null, tint = Color(0xFF00796B), modifier = Modifier.size(14.dp))
                                        Text(
                                            "Get Directions",
                                            fontSize = 11.5.sp,
                                            fontWeight = FontWeight.Bold,
                                            color = Color(0xFF00796B),
                                            maxLines = 1,
                                            softWrap = false
                                        )
                                    }
                                }
                            }`;

if (oldAddressRegex.test(clinicDetail)) {
    clinicDetail = clinicDetail.replace(oldAddressRegex, newAddress);
    console.log('✅ Fixed Get Directions button and address weight constraint');
} else {
    console.warn('⚠️ Could not match oldAddressRegex in ClinicDetailScreen.kt');
}

fs.writeFileSync(clinicDetailPath, clinicDetail, 'utf8');

// 2. Fix MedicalSearchEngine.kt (strip parentheses and punctuation so "Cardiology (Heart)" matches accurately)
const searchEnginePath = path.join(__dirname, '../patient-app/app/src/main/java/com/dactor/patient/util/MedicalSearchEngine.kt');
let searchEngine = fs.readFileSync(searchEnginePath, 'utf8');

searchEngine = searchEngine.replace(
    /fun getSuggestedSpecialties\(query: String\): List<String> \{\s*val clean = query\.trim\(\)\.lowercase\(Locale\.ROOT\)/,
    `fun getSuggestedSpecialties(query: String): List<String> {\n        val clean = query.replace(Regex("[^a-zA-Z0-9\\\\s]"), " ").trim().lowercase(Locale.ROOT)`
);

searchEngine = searchEngine.replace(
    /fun expandQuery\(query: String\): Set<String> \{\s*val clean = query\.trim\(\)\.lowercase\(Locale\.ROOT\)/,
    `fun expandQuery(query: String): Set<String> {\n        val clean = query.replace(Regex("[^a-zA-Z0-9\\\\s]"), " ").trim().lowercase(Locale.ROOT)`
);

fs.writeFileSync(searchEnginePath, searchEngine, 'utf8');
console.log('✅ Updated MedicalSearchEngine query normalization');

// 3. Fix PatientSearchScreen.kt doctor name formatting
const searchScreenPath = path.join(__dirname, '../patient-app/app/src/main/java/com/dactor/patient/ui/search/PatientSearchScreen.kt');
let searchScreen = fs.readFileSync(searchScreenPath, 'utf8');

searchScreen = searchScreen.replace(
    /text = "Dr\. \$\{primaryDoctor\.fullName\.removePrefix\("Dr\."\)\.trim\(\)\}"/,
    `text = "Dr. \${primaryDoctor.fullName.replace(Regex("^(?i)dr\\\\.?\\\\s*"), "").trim()}"`
);
searchScreen = searchScreen.replace(
    /text = "Dr\. \$\{doctor\.fullName\}"/,
    `text = "Dr. \${doctor.fullName.replace(Regex("^(?i)dr\\\\.?\\\\s*"), "").trim()}"`
);

fs.writeFileSync(searchScreenPath, searchScreen, 'utf8');
console.log('✅ Updated PatientSearchScreen doctor name prefix removal');
