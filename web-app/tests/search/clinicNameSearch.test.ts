/**
 * Regression suite: searching a clinic by its name (Patient Portal booking search).
 *
 * Mirrors patient-app MedicalSearchEngineClinicNameSearchTest.kt so web and Android stay in parity.
 * Run: node --experimental-strip-types tests/search/clinicNameSearch.test.ts
 */

import { matchClinic, matchDoctor, getSuggestedSpecialties, nameMatchesAllWords, matchesWordStart } from '../../src/utils/searchEngine.ts'

declare const process: any

const clinic = (id: string, name: string, addressText: string, type: string, specialties: string[], description: string): any =>
  ({ id, name, addressText, type, specialties, description })
const doctor = (id: string, fullName: string, specialty: string, clinicId: string, description: string, education: string): any =>
  ({ id, fullName, specialty, specialties: [specialty], clinicId, description, education })

const kantipur = clinic('kantipur', 'Kantipur Health Center', 'Baneshwor, Kathmandu', 'multi_visit', ['General Medicine'], 'Community health center')
const patanDental = clinic('patan', 'Patan Dental Clinic', 'Pulchowk, Lalitpur', 'single_visit', ['Dental'], 'Family dental clinic')
const cityCare = clinic('citycare', 'City Care Polyclinic', 'New Road, Kathmandu', 'multi_visit', ['Cardiology', 'ENT', 'Pediatrics'], 'Leading polyclinic and medical center in Kathmandu')
const sunrise = clinic('sunrise', 'Sunrise Polyclinic', 'Lakeside, Pokhara', 'multi_visit', ['General Medicine'], '')
const everest = clinic('everest', 'Everest Diagnostic Lab', 'Maharajgunj, Kathmandu', 'diagnostic_lab', ['Pathology'], 'Diagnostic center')
const heartCare = clinic('heartcare', 'Heart Care Hospital', 'Chabahil, Kathmandu', 'multi_visit', ['Cardiology'], '')

const cityCareDoctors = [
  doctor('d1', 'Ramesh Shrestha', 'Cardiologist', 'citycare', 'Senior consultant at City Care Polyclinic medical center', 'MBBS, MD'),
  doctor('d2', 'Sita Sharma', 'ENT', 'citycare', 'ENT surgeon at the clinic', 'MBBS, MS'),
  doctor('d3', 'Vincent Rai', 'Pediatrician', 'citycare', 'Child specialist, polyclinic OPD', 'MBBS, MD'),
]
const doctorsOf: Record<string, any[]> = {
  citycare: cityCareDoctors,
  kantipur: [doctor('d4', 'Hari Thapa', 'General Physician', 'kantipur', '', 'MBBS')],
}
const allClinics = [kantipur, patanDental, cityCare, sunrise, everest, heartCare]

/** Matching clinic ids for `query`, best match first (same ordering as the Patient Portal list). */
function rank(query: string): string[] {
  return allClinics
    .map((c) => ({ c, m: matchClinic(c, doctorsOf[c.id] || [], [], query) }))
    .filter((r) => r.m.isMatch)
    .sort((a, b) => b.m.score - a.m.score)
    .map((r) => r.c.id)
}

let failed = 0
function check(name: string, ok: boolean, detail = '') {
  if (ok) console.log(`  ✅ ${name}`)
  else {
    failed++
    console.error(`  ❌ ${name} ${detail}`)
  }
}
const eq = (name: string, actual: unknown, expected: unknown) =>
  check(name, JSON.stringify(actual) === JSON.stringify(expected), `expected ${JSON.stringify(expected)} but was ${JSON.stringify(actual)}`)

console.log('Clinic name search')

// Full clinic name ranks that clinic first
eq('"Kantipur Health Center" first', rank('Kantipur Health Center')[0], 'kantipur')
eq('"Sunrise Polyclinic" first', rank('Sunrise Polyclinic')[0], 'sunrise')
eq('"Patan Dental Clinic" first', rank('Patan Dental Clinic')[0], 'patan')
eq('"Heart Care Hospital" first', rank('Heart Care Hospital')[0], 'heartcare')
eq('"City Care Polyclinic" first', rank('City Care Polyclinic')[0], 'citycare')

// Partial clinic name ranks that clinic first
eq('"kantipur" first', rank('kantipur')[0], 'kantipur')
eq('"everest lab" first', rank('everest lab')[0], 'everest')
eq('"sunrise poly" first', rank('sunrise poly')[0], 'sunrise')

// Clinic names must not trigger unrelated specialties through substrings ("c-ent-er", "d-ent-al", "h-ear-t")
eq('"Kantipur Health Center" only matches Kantipur', rank('Kantipur Health Center'), ['kantipur'])
check('"Patan Dental Clinic" does not match the ENT polyclinic', !rank('Patan Dental Clinic').includes('citycare'))
check('"Kantipur Health Center" suggests no ENT', !getSuggestedSpecialties('Kantipur Health Center').includes('ENT Specialist'))
check('"Heart Care Hospital" suggests no ENT', !getSuggestedSpecialties('Heart Care Hospital').includes('ENT Specialist'))

// Generic facility words must not match every clinic
eq('"Sunrise Polyclinic" only matches Sunrise', rank('Sunrise Polyclinic'), ['sunrise'])
eq('"Patan Dental Clinic" only matches Patan', rank('Patan Dental Clinic'), ['patan'])
check('"polyclinic" on its own still lists polyclinics', ['sunrise', 'citycare'].every((id) => rank('polyclinic').includes(id)))

// Symptom and specialty search still work
eq('"ent" only matches the ENT polyclinic', rank('ent'), ['citycare'])
check('"ent" does not match Kantipur Health Center (c-ent-er)', !rank('ent').includes('kantipur'))
check('"ent" does not match Patan Dental Clinic (d-ent-al)', !rank('ent').includes('patan'))
check('"ear pain" finds ENT', rank('ear pain').includes('citycare'))
check('"dentist" finds dental clinic', rank('dentist').includes('patan'))
check('"chest pain" finds cardiology', ['citycare', 'heartcare'].every((id) => rank('chest pain').includes(id)))
check('"child" finds pediatrics', rank('child').includes('citycare'))
check('"blood test" finds lab', rank('blood test').includes('everest'))

// Doctor search by clinic name ignores generic words
check('Doctor at City Care does not match "Sunrise Polyclinic"', !matchDoctor(cityCareDoctors[0], [cityCare], 'Sunrise Polyclinic').isMatch)
check('Doctor at City Care matches "City Care Polyclinic"', matchDoctor(cityCareDoctors[0], [cityCare], 'City Care Polyclinic').isMatch)

// Nepali Unicode script clinic name matching
check('Nepali script tokenization and word start match', matchesWordStart('पाटन डेन्टल क्लिनिक', 'पाटन'))
check('Nepali script full name matches all words', nameMatchesAllWords('पाटन डेन्टल क्लिनिक', 'पाटन डेन्टल'))
check('Nepali script partial word match', matchesWordStart('काठमाडौं पोलिक्लिनिक', 'काठमाडौं'))

if (failed > 0) {
  console.error(`\n❌ ${failed} clinic search check(s) failed`)
  process.exit(1)
}
console.log('\n✅ All clinic search checks passed')
