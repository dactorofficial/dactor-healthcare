import { Clinic, Doctor, ClinicService } from '../types'

export interface SearchMatchResult {
  isMatch: boolean
  score: number
  matchedDoctors: Doctor[]
  matchHighlightReason?: string
}

// Layman symptom, organ, and condition mapping to medical specialty stems
export const SYNONYM_MAP: Record<string, string[]> = {
  // Dermatology / Skin
  skin: ['dermatol', 'skin', 'cosmetol', 'venereol', 'derma'],
  acne: ['dermatol', 'skin', 'cosmetol'],
  pimple: ['dermatol', 'skin'],
  pimples: ['dermatol', 'skin'],
  rash: ['dermatol', 'skin', 'allergy'],
  rashes: ['dermatol', 'skin', 'allergy'],
  allergy: ['dermatol', 'allergy', 'immunol', 'pulmon'],
  hair: ['dermatol', 'trichol', 'hair'],
  scalp: ['dermatol', 'skin'],
  eczema: ['dermatol', 'skin'],
  dermatology: ['dermatol', 'skin'],
  dermatologist: ['dermatol', 'skin'],

  // Cardiology / Heart
  heart: ['cardio', 'heart', 'internal medicine'],
  cardiac: ['cardio', 'heart'],
  'chest pain': ['cardio', 'pulmon', 'internal medicine'],
  bp: ['cardio', 'internal medicine', 'physician'],
  hypertension: ['cardio', 'internal medicine'],
  'blood pressure': ['cardio', 'internal medicine'],
  cardiologist: ['cardio', 'heart'],
  cardiology: ['cardio', 'heart'],

  // Orthopedics / Bone & Joints
  bone: ['ortho', 'bone', 'joint', 'physiotherap'],
  bones: ['ortho', 'bone', 'joint'],
  joint: ['ortho', 'rheumatol', 'joint'],
  joints: ['ortho', 'rheumatol'],
  fracture: ['ortho', 'trauma', 'bone'],
  knee: ['ortho', 'joint', 'physiotherap'],
  spine: ['ortho', 'neuro', 'spine'],
  'back pain': ['ortho', 'physiotherap', 'spine'],
  arthritis: ['ortho', 'rheumatol'],
  ligament: ['ortho', 'sports medicine'],
  orthopedic: ['ortho', 'bone'],
  orthopedics: ['ortho', 'bone'],
  orthopedician: ['ortho', 'bone'],

  // Ophthalmology / Eye
  eye: ['ophthalm', 'eye', 'optom', 'vision'],
  eyes: ['ophthalm', 'eye', 'optom'],
  vision: ['ophthalm', 'eye', 'optom'],
  cataract: ['ophthalm', 'eye'],
  glasses: ['optom', 'ophthalm', 'eye'],
  spectacle: ['optom', 'ophthalm'],
  retina: ['ophthalm', 'retina'],
  ophthalmologist: ['ophthalm', 'eye'],
  ophthalmology: ['ophthalm', 'eye'],

  // Dental
  tooth: ['dent', 'oral', 'maxillofac'],
  teeth: ['dent', 'oral'],
  dental: ['dent', 'oral'],
  dentist: ['dent', 'oral'],
  gum: ['dent', 'periodont'],
  cavity: ['dent', 'oral'],
  'root canal': ['dent', 'endodont'],
  braces: ['dent', 'orthodont'],

  // Pediatrics / Child
  child: ['pediatr', 'child', 'neonat'],
  children: ['pediatr', 'child'],
  baby: ['pediatr', 'neonat', 'child'],
  kid: ['pediatr', 'child'],
  kids: ['pediatr', 'child'],
  infant: ['pediatr', 'neonat'],
  newborn: ['neonat', 'pediatr'],
  vaccine: ['pediatr', 'immuniz', 'general'],
  vaccination: ['pediatr', 'immuniz', 'general'],
  pediatrician: ['pediatr', 'child'],
  pediatrics: ['pediatr', 'child'],

  // ENT
  ear: ['ent', 'otolaryng', 'ear'],
  nose: ['ent', 'rhinol', 'nose'],
  throat: ['ent', 'laryngol', 'throat'],
  ent: ['ent', 'otolaryng', 'ear', 'nose', 'throat'],
  sinus: ['ent', 'rhinol'],
  hearing: ['ent', 'audiol'],
  tonsil: ['ent', 'throat'],

  // Gynecology & Obstetrics
  women: ['gynec', 'obstetr', 'obgyn', 'women'],
  female: ['gynec', 'obstetr', 'obgyn'],
  pregnancy: ['obstetr', 'gynec', 'matern'],
  pregnant: ['obstetr', 'gynec'],
  period: ['gynec', 'menstru'],
  menstrual: ['gynec'],
  gynecologist: ['gynec', 'obstetr', 'obgyn'],
  gynecology: ['gynec', 'obstetr', 'obgyn'],
  delivery: ['obstetr', 'matern'],

  // Neurology / Brain
  brain: ['neuro', 'brain'],
  nerve: ['neuro', 'nerve'],
  nerves: ['neuro'],
  headache: ['neuro', 'general', 'physician'],
  migraine: ['neuro'],
  stroke: ['neuro'],
  paralysis: ['neuro', 'physiotherap'],
  seizure: ['neuro', 'epilep'],
  neurologist: ['neuro', 'brain'],
  neurology: ['neuro', 'brain'],

  // Psychiatry / Mind
  mind: ['psychiatr', 'psycholog', 'mental'],
  mental: ['psychiatr', 'psycholog', 'mental'],
  depression: ['psychiatr', 'psycholog', 'mental'],
  anxiety: ['psychiatr', 'psycholog'],
  stress: ['psychiatr', 'psycholog'],
  sleep: ['psychiatr', 'neuro', 'pulmon'],
  insomnia: ['psychiatr', 'neuro'],
  psychiatrist: ['psychiatr', 'mental'],
  psychiatry: ['psychiatr', 'mental'],

  // Gastroenterology / Stomach
  stomach: ['gastro', 'digest', 'internal medicine'],
  digest: ['gastro', 'digest'],
  digestion: ['gastro', 'digest'],
  gastric: ['gastro', 'acidity'],
  acidity: ['gastro', 'internal medicine'],
  liver: ['hepatol', 'gastro'],
  constipation: ['gastro'],
  diarrhea: ['gastro', 'general'],
  gastroenterologist: ['gastro', 'digest'],
  gastroenterology: ['gastro', 'digest'],

  // Nephrology & Urology / Kidney
  kidney: ['nephro', 'uro', 'kidney', 'renal'],
  urine: ['uro', 'nephro', 'urinalysis'],
  urinary: ['uro', 'nephro'],
  stone: ['uro', 'nephro', 'surgeon'],
  prostate: ['uro'],
  dialysis: ['nephro'],
  nephrologist: ['nephro', 'kidney'],
  urologist: ['uro', 'urinary'],

  // Oncology / Cancer
  cancer: ['oncol', 'cancer', 'tumor'],
  tumor: ['oncol', 'surgeon'],
  chemo: ['oncol'],
  oncologist: ['oncol', 'cancer'],
  oncology: ['oncol', 'cancer'],

  // Pulmonology / Lungs & Chest
  lungs: ['pulmon', 'chest', 'respirat'],
  breath: ['pulmon', 'respirat'],
  breathing: ['pulmon', 'respirat'],
  asthma: ['pulmon', 'allergy'],
  tb: ['pulmon', 'tubercul', 'chest'],
  tuberculosis: ['pulmon', 'tubercul'],
  pulmonologist: ['pulmon', 'chest'],
  pulmonology: ['pulmon', 'chest'],

  // Endocrinology / Diabetes & Thyroid
  sugar: ['endocrin', 'diabet', 'internal medicine'],
  diabetes: ['endocrin', 'diabet', 'internal medicine'],
  diabetic: ['endocrin', 'diabet'],
  thyroid: ['endocrin', 'internal medicine', 'tsh'],
  hormone: ['endocrin'],
  endocrinologist: ['endocrin'],

  // General Medicine
  fever: ['general', 'internal medicine', 'physician'],
  cold: ['general', 'physician', 'ent'],
  cough: ['general', 'pulmon', 'physician'],
  general: ['general', 'internal medicine', 'physician'],
  physician: ['physician', 'general', 'internal medicine'],
  checkup: ['general', 'internal medicine'],

  // Pathology & Lab Tests
  blood: ['patholog', 'lab', 'diagnostic', 'hematol', 'cbc', 'blood'],
  'blood test': ['lab', 'patholog', 'diagnostic', 'cbc', 'hematol'],
  test: ['lab', 'patholog', 'diagnostic', 'test'],
  lab: ['lab', 'patholog', 'diagnostic'],
  pathology: ['patholog', 'lab', 'diagnostic'],
  cbc: ['cbc', 'blood', 'lab', 'patholog', 'hematol'],
  'complete blood count': ['cbc', 'blood', 'lab', 'patholog'],
  hemoglobin: ['cbc', 'blood', 'lab', 'patholog'],
  platelet: ['cbc', 'blood', 'lab', 'patholog'],
  platelets: ['cbc', 'blood', 'lab', 'patholog'],
  tsh: ['thyroid', 'tsh', 'lab'],
  lipid: ['lipid', 'cholesterol', 'lab', 'cardio'],
  cholesterol: ['lipid', 'cholesterol', 'lab'],
  urinalysis: ['urine', 'urinalysis', 'lab'],
  glucose: ['glucose', 'sugar', 'fbs', 'lab', 'diabet'],
  'sugar test': ['glucose', 'sugar', 'fbs', 'lab'],
  fbs: ['glucose', 'sugar', 'fbs', 'lab'],
  hba1c: ['glucose', 'sugar', 'hba1c', 'lab'],
  lft: ['lft', 'liver', 'lab', 'hepatol'],
  kft: ['kft', 'kidney', 'renal', 'lab', 'nephro'],
  creatinine: ['kft', 'kidney', 'renal', 'lab'],

  // Radiology & Scans
  xray: ['radiolog', 'imaging'],
  'x-ray': ['radiolog', 'imaging'],
  ultrasound: ['radiolog', 'sonolog'],
  usg: ['radiolog', 'sonolog'],
  ct: ['radiolog', 'imaging'],
  mri: ['radiolog', 'imaging'],
  scan: ['radiolog', 'imaging'],

  // Surgery
  surgery: ['surgeon', 'surgery', 'surgical'],
  surgeon: ['surgeon', 'surgery'],
  operation: ['surgeon', 'surgery'],

  // Physiotherapy
  physio: ['physiotherap', 'rehab'],
  physiotherapy: ['physiotherap', 'rehab'],
}

// Symptom / Keyword to Human-Readable Specialist Suggestions
export const SYMPTOM_TO_SPECIALIST_SUGGESTIONS: Record<string, string[]> = {
  skin: ['Dermatologist', 'Dermatology', 'Cosmetologist'],
  derma: ['Dermatologist', 'Dermatology'],
  acne: ['Dermatologist', 'Cosmetologist'],
  pimple: ['Dermatologist'],
  rash: ['Dermatologist', 'Allergist'],
  allergy: ['Dermatologist', 'Allergist', 'Pulmonologist'],
  hair: ['Dermatologist', 'Trichologist'],
  eczema: ['Dermatologist'],
  fungal: ['Dermatologist'],
  itch: ['Dermatologist'],

  heart: ['Cardiologist', 'Cardiology', 'Internal Medicine'],
  cardio: ['Cardiologist', 'Cardiology'],
  chest: ['Cardiologist', 'Pulmonologist', 'General Physician'],
  bp: ['Cardiologist', 'General Physician'],
  pressure: ['Cardiologist', 'Internal Medicine'],
  hypertension: ['Cardiologist', 'Internal Medicine'],

  bone: ['Orthopedic', 'Orthopedician', 'Physiotherapist'],
  ortho: ['Orthopedic', 'Orthopedician'],
  joint: ['Orthopedic', 'Rheumatologist'],
  fracture: ['Orthopedic', 'Trauma Surgeon'],
  knee: ['Orthopedic', 'Physiotherapist'],
  back: ['Orthopedic', 'Spine Specialist', 'Physiotherapist'],
  spine: ['Orthopedic', 'Neurologist'],
  arthritis: ['Orthopedic', 'Rheumatologist'],

  eye: ['Ophthalmologist', 'Optometrist', 'Eye Specialist'],
  vision: ['Ophthalmologist', 'Optometrist'],
  cataract: ['Ophthalmologist'],
  retina: ['Ophthalmologist'],

  tooth: ['Dentist', 'Dental Surgeon'],
  teeth: ['Dentist', 'Dental Surgeon', 'Orthodontist'],
  dent: ['Dentist', 'Dental Care'],
  gum: ['Dentist', 'Periodontist'],
  cavity: ['Dentist'],

  child: ['Pediatrician', 'Pediatrics', 'Child Specialist'],
  baby: ['Pediatrician', 'Neonatologist'],
  kid: ['Pediatrician', 'Child Specialist'],
  infant: ['Pediatrician', 'Neonatologist'],
  pediatr: ['Pediatrician', 'Pediatrics'],
  vaccine: ['Pediatrician', 'General Physician'],

  ear: ['ENT Specialist', 'Otolaryngologist'],
  nose: ['ENT Specialist', 'Otolaryngologist'],
  throat: ['ENT Specialist', 'Otolaryngologist'],
  ent: ['ENT Specialist', 'Otolaryngologist'],
  sinus: ['ENT Specialist'],
  tonsil: ['ENT Specialist'],

  women: ['Gynecologist', 'Obstetrician', 'OB-GYN'],
  female: ['Gynecologist', 'OB-GYN'],
  pregnan: ['Gynecologist', 'Obstetrician'],
  period: ['Gynecologist'],
  gynec: ['Gynecologist', 'Obstetrician'],

  brain: ['Neurologist', 'Neurosurgeon'],
  nerve: ['Neurologist'],
  headache: ['Neurologist', 'General Physician'],
  migraine: ['Neurologist'],
  neuro: ['Neurologist', 'Neurology'],
  stroke: ['Neurologist'],

  mind: ['Psychiatrist', 'Psychologist'],
  mental: ['Psychiatrist', 'Psychologist'],
  depress: ['Psychiatrist', 'Psychologist'],
  anxiet: ['Psychiatrist', 'Psychologist'],
  stress: ['Psychiatrist', 'Psychologist'],
  sleep: ['Psychiatrist', 'Neurologist'],

  stomach: ['Gastroenterologist', 'General Physician'],
  gastric: ['Gastroenterologist', 'Internal Medicine'],
  digest: ['Gastroenterologist'],
  liver: ['Gastroenterologist', 'Hepatologist'],
  acidity: ['Gastroenterologist', 'General Physician'],

  kidney: ['Nephrologist', 'Urologist'],
  urine: ['Urologist', 'Nephrologist'],
  stone: ['Urologist', 'General Surgeon'],

  cancer: ['Oncologist', 'Oncology'],
  tumor: ['Oncologist', 'Surgeon'],

  lung: ['Pulmonologist', 'Chest Specialist'],
  breath: ['Pulmonologist'],
  asthma: ['Pulmonologist'],
  cough: ['General Physician', 'Pulmonologist'],

  sugar: ['Endocrinologist', 'Diabetologist', 'Internal Medicine'],
  diabet: ['Endocrinologist', 'Diabetologist'],
  thyroid: ['Endocrinologist', 'Internal Medicine'],

  fever: ['General Physician', 'Internal Medicine'],
  cold: ['General Physician', 'ENT Specialist'],
  flu: ['General Physician'],
  general: ['General Physician', 'Internal Medicine'],
  physician: ['General Physician', 'Internal Medicine'],
  physio: ['Physiotherapist', 'Rehabilitation'],
}

export const QUICK_SPECIALTY_SUGGESTIONS = [
  'Skin / Dermatologist',
  'Heart / Cardiologist',
  'Bone & Joint (Ortho)',
  'Dental Care',
  'Child / Pediatrician',
  'Eye Specialist',
  'Women / Gynecologist',
  'ENT Specialist',
  'General Physician',
  'Diagnostic Lab Tests',
  'MRI & CT Scan Imaging',
  'Pathology & Blood Tests',
]

/**
 * Returns suggested specialist titles for a search query.
 */
export function getSuggestedSpecialties(query: string): string[] {
  const clean = query.trim().toLowerCase()
  if (clean.length < 2) return []

  const suggestions = new Set<string>()
  const tokens = clean.split(/\s+/).filter((t) => t.length >= 2)

  for (const [key, specialists] of Object.entries(SYMPTOM_TO_SPECIALIST_SUGGESTIONS)) {
    if (
      key === clean ||
      key.startsWith(clean) ||
      clean.includes(key) ||
      tokens.some((tok) => key === tok || key.startsWith(tok) || tok.includes(key))
    ) {
      specialists.forEach((s) => suggestions.add(s))
    }
  }

  if (suggestions.size === 0) {
    for (const specialists of Object.values(SYMPTOM_TO_SPECIALIST_SUGGESTIONS)) {
      for (const spec of specialists) {
        if (spec.toLowerCase().includes(clean)) {
          suggestions.add(spec)
        }
      }
    }
  }

  return Array.from(suggestions)
}

/**
 * Expands a search query into searchable stems and medical keywords.
 */
export function expandQuery(query: string): Set<string> {
  const clean = query.trim().toLowerCase()
  if (!clean) return new Set()

  const tokens = clean.split(/\s+/).filter((t) => t.length > 0)
  const stems = new Set<string>()
  stems.add(clean)
  tokens.forEach((t) => stems.add(t))

  // Whole query synonyms
  for (const [key, syns] of Object.entries(SYNONYM_MAP)) {
    if (key === clean || (clean.length >= 3 && key.startsWith(clean)) || clean.includes(key)) {
      syns.forEach((s) => stems.add(s))
    }
  }

  // Token-by-token synonyms
  for (const token of tokens) {
    if (SYNONYM_MAP[token]) {
      SYNONYM_MAP[token].forEach((s) => stems.add(s))
    }
    if (token.length >= 3) {
      for (const [key, syns] of Object.entries(SYNONYM_MAP)) {
        if (key.startsWith(token)) {
          syns.forEach((s) => stems.add(s))
        }
      }
    }
  }

  // Include suggested specialty stems
  getSuggestedSpecialties(clean).forEach((spec) => {
    stems.add(spec.toLowerCase())
  })

  return stems
}

/**
 * Matches a clinic, its doctors, and its services against a user search query.
 * Ranked strictly in order:
 * 1. Specialty or symptom keywords (Rank 1, Score: 150)
 * 2. Doctor specialty / symptom keywords (Rank 1b, Score: 145) & Doctor name (Rank 2, Score: 120)
 * 3. Diagnostic Lab test / Service name (Score: 115)
 * 4. Clinic Name (Rank 3, Score: 95)
 * 5. Location or Area (Rank 4, Score: 75)
 */
export function matchClinic(
  clinic: Clinic,
  doctors: Doctor[] = [],
  services: ClinicService[] = [],
  query: string
): SearchMatchResult {
  const q = query.trim().toLowerCase()
  if (!q) {
    return { isMatch: true, score: 0, matchedDoctors: [] }
  }

  const clinicNameLower = (clinic.name || '').toLowerCase()
  const clinicAddrLower = (clinic.addressText || '').toLowerCase()
  const clinicTypeLower = (clinic.type || '').toLowerCase()
  const clinicDescLower = (clinic.description || '').toLowerCase()
  const clinicSpecsJoined = (clinic.specialties || []).join(' ').toLowerCase()

  const expandedStems = expandQuery(q)
  const stemsArray = Array.from(expandedStems)
  const suggestedSpecs = getSuggestedSpecialties(q)

  let score = 0
  let highlightReason: string | undefined = undefined
  const matchedDocs: Doctor[] = []

  // 1. Specialty or symptom keywords in Clinic Specialties
  for (const cSpec of clinic.specialties || []) {
    const cSpecLower = cSpec.toLowerCase()
    if (cSpecLower.includes(q)) {
      score += 150
      if (!highlightReason) highlightReason = `Specialty: ${cSpec}`
    } else {
      for (const stem of stemsArray) {
        if (cSpecLower.includes(stem)) {
          score += 140
          if (!highlightReason) {
            const sug = suggestedSpecs[0] || cSpec
            highlightReason = `Suggested (${sug}): ${cSpec}`
          }
          break
        }
      }
    }
  }

  // 1b & 2. Doctor Specialty / Symptom Keywords (Rank 1) & Doctor Name (Rank 2)
  for (const doc of doctors) {
    const docNameLower = (doc.fullName || '').toLowerCase()
    const docSpecLower = (doc.specialty || '').toLowerCase()
    const docSpecsListLower = (doc.specialties || []).map((s) => s.toLowerCase()).join(' ')
    const allDocSpecs = `${docSpecLower} ${docSpecsListLower}`
    const docBioLower = (doc.description || '').toLowerCase()
    const docEduLower = (doc.education || '').toLowerCase()

    let docMatched = false

    // Rank 1: Doctor Specialty exact or symptom stem match
    if (allDocSpecs.includes(q)) {
      score += 145
      docMatched = true
      if (!highlightReason) {
        highlightReason = `Specialist: ${doc.specialty || doc.specialties?.[0] || 'Doctor'} (${doc.fullName.startsWith('Dr.') ? doc.fullName : `Dr. ${doc.fullName}`})`
      }
    } else {
      for (const stem of stemsArray) {
        if (allDocSpecs.includes(stem) || docBioLower.includes(stem) || docEduLower.includes(stem)) {
          score += 135
          docMatched = true
          if (!highlightReason) {
            const displaySpec = doc.specialty || suggestedSpecs[0] || 'Specialist'
            highlightReason = `Has ${displaySpec}: ${doc.fullName.startsWith('Dr.') ? doc.fullName : `Dr. ${doc.fullName}`}`
          }
          break
        }
      }
    }

    // Rank 2: Doctor Name match
    if (docNameLower.includes(q) || `dr. ${docNameLower}`.includes(q)) {
      score += 120
      docMatched = true
      if (!highlightReason) {
        highlightReason = `Matched Doctor: ${doc.fullName.startsWith('Dr.') ? doc.fullName : `Dr. ${doc.fullName}`}`
      }
    } else {
      for (const stem of stemsArray) {
        if (docNameLower.includes(stem)) {
          score += 110
          docMatched = true
          if (!highlightReason) {
            highlightReason = `Matched Doctor: ${doc.fullName.startsWith('Dr.') ? doc.fullName : `Dr. ${doc.fullName}`}`
          }
          break
        }
      }
    }

    if (docMatched) {
      // Doctor In-Clinic Presence boost (matches mobile app priority for available doctors)
      const isDocInThisClinic = doc.isInClinic !== false && (!doc.activeClinicId || doc.activeClinicId === clinic.id)
      if (isDocInThisClinic) {
        score += 20
      }
      matchedDocs.push(doc)
    }
  }

  // General In-Clinic Doctors boost for centers with active doctor presence
  const hasActiveDocInClinic = doctors.some(
    (d) => d.isInClinic !== false && (!d.activeClinicId || d.activeClinicId === clinic.id)
  )
  if (hasActiveDocInClinic && score > 0) {
    score += 15
  }

  // 3. Service / Diagnostic Lab Test matching
  const isLabClinic =
    clinicTypeLower.includes('lab') ||
    clinicTypeLower === 'diagnostic_lab' ||
    clinicNameLower.includes('lab') ||
    clinicSpecsJoined.includes('lab') ||
    clinicSpecsJoined.includes('patholog')

  for (const srv of services) {
    const srvLower = (srv.serviceName || '').toLowerCase()
    const srvDescLower = (srv.description || '').toLowerCase()

    if (srvLower.includes(q) || (q.length >= 3 && srvDescLower.includes(q))) {
      score += isLabClinic ? 115 : 60
      if (!highlightReason) {
        highlightReason = isLabClinic
          ? `Offers Lab Test: ${srv.serviceName} (NPR ${Math.round(srv.price)})`
          : `Service Offered: ${srv.serviceName}`
      }
    } else {
      for (const stem of stemsArray) {
        if (srvLower.includes(stem) || (stem.length >= 3 && srvDescLower.includes(stem))) {
          score += isLabClinic ? 95 : 50
          if (!highlightReason) {
            highlightReason = isLabClinic
              ? `Offers Lab Test: ${srv.serviceName} (NPR ${Math.round(srv.price)})`
              : `Service Offered: ${srv.serviceName}`
          }
          break
        }
      }
    }
  }

  // 4. Clinic Name (Rank 3)
  if (clinicNameLower.includes(q)) {
    score += 95
    if (!highlightReason) highlightReason = `Matched Clinic Name: ${clinic.name}`
  } else {
    for (const stem of stemsArray) {
      if (clinicNameLower.includes(stem)) {
        score += 85
        if (!highlightReason) highlightReason = `Clinic Name Match: ${clinic.name}`
        break
      }
    }
  }

  // 5. Location or Area (Rank 4)
  if (clinicAddrLower.includes(q)) {
    score += 75
    if (!highlightReason) highlightReason = `Matched Location: ${clinic.addressText || clinic.name}`
  } else {
    for (const stem of stemsArray) {
      if (clinicAddrLower.includes(stem)) {
        score += 65
        if (!highlightReason) highlightReason = `Location Match: ${clinic.addressText || clinic.name}`
        break
      }
    }
  }

  // 6. Fallback: description or type
  for (const stem of stemsArray) {
    if (clinicDescLower.includes(stem)) {
      score += 35
      if (!highlightReason) highlightReason = `Clinic Specialty Match: ${clinic.name}`
    }
    if (clinicTypeLower.includes(stem)) {
      score += 20
    }
  }

  return {
    isMatch: score > 0,
    score,
    matchedDoctors: Array.from(new Set(matchedDocs.map((d) => d.id))).map(
      (id) => matchedDocs.find((d) => d.id === id)!
    ),
    matchHighlightReason: highlightReason,
  }
}

/**
 * Matches an individual doctor and their practicing clinics against a user search query.
 * Strict Parity with Android MedicalSearchEngine.kt
 */
export function matchDoctor(
  doctor: Doctor,
  clinics: Clinic[] = [],
  query: string
): SearchMatchResult {
  const q = query.trim().toLowerCase()
  if (!q) {
    return { isMatch: true, score: 50, matchedDoctors: [doctor] }
  }

  const expandedStems = expandQuery(q)
  const stemsArray = Array.from(expandedStems)
  const suggestedSpecs = getSuggestedSpecialties(q)

  const docNameLower = (doctor.fullName || '').toLowerCase()
  const docSpecLower = (doctor.specialty || '').toLowerCase()
  const docSpecsJoined = (doctor.specialties || []).join(' ').toLowerCase()
  const allDocSpecs = `${docSpecLower} ${docSpecsJoined}`
  const docBioLower = (doctor.bio || doctor.description || '').toLowerCase()
  const docEduLower = (doctor.education || '').toLowerCase()

  let score = 0
  let highlightReason: string | undefined = undefined

  // 1. Specialty or symptom keywords ("skin", "heart", "child")
  if (allDocSpecs.includes(q)) {
    score += 150
    highlightReason = `Specialist: ${doctor.specialty || doctor.specialties?.[0] || 'Specialist'}`
  } else {
    for (const stem of stemsArray) {
      if (allDocSpecs.includes(stem)) {
        score += 140
        const matchedSug = suggestedSpecs[0] || doctor.specialty || 'Specialist'
        highlightReason = `Suggested for '${query}': ${matchedSug}`
        break
      }
      if (docBioLower.includes(stem) || docEduLower.includes(stem)) {
        score += 125
        highlightReason = `Recommended ${doctor.specialty || 'Specialist'} for '${query}'`
        break
      }
    }
  }

  // 2. Doctor Name
  if (docNameLower.includes(q) || `dr. ${docNameLower}`.includes(q)) {
    score += 120
    if (!highlightReason) highlightReason = `Matched Doctor: Dr. ${doctor.fullName}`
  } else {
    for (const stem of stemsArray) {
      if (docNameLower.includes(stem)) {
        score += 110
        if (!highlightReason) highlightReason = `Matched Doctor: Dr. ${doctor.fullName}`
        break
      }
    }
  }

  // 3. Practicing Clinics & Area
  for (const clinic of clinics) {
    const cName = (clinic.name || '').toLowerCase()
    const cAddr = (clinic.addressText || '').toLowerCase()
    if (cName.includes(q)) {
      score += 95
      if (!highlightReason) highlightReason = `Practices at ${clinic.name}`
      break
    }
    if (cAddr.includes(q)) {
      score += 75
      if (!highlightReason) highlightReason = `Area: ${clinic.addressText || clinic.name}`
      break
    }
    for (const stem of stemsArray) {
      if (cName.includes(stem)) {
        score += 85
        if (!highlightReason) highlightReason = `Practices at ${clinic.name}`
        break
      }
      if (cAddr.includes(stem)) {
        score += 65
        if (!highlightReason) highlightReason = `Area: ${clinic.addressText || clinic.name}`
        break
      }
    }
  }

  return {
    isMatch: score > 0,
    score,
    matchedDoctors: score > 0 ? [doctor] : [],
    matchHighlightReason: highlightReason,
  }
}

// -------------------------------------------------------------
// RECENT SEARCHES MANAGER (Stored in localStorage)
// -------------------------------------------------------------
const RECENT_SEARCHES_KEY = 'dactor_recent_patient_searches'

export function getRecentSearches(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_SEARCHES_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.slice(0, 5) : []
  } catch {
    return []
  }
}

export function saveRecentSearch(keyword: string): void {
  const clean = keyword.trim()
  if (!clean || clean.length < 2) return
  try {
    const current = getRecentSearches().filter(
      (k) => k.toLowerCase() !== clean.toLowerCase()
    )
    const updated = [clean, ...current].slice(0, 5)
    localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(updated))
  } catch {}
}

export function clearRecentSearches(): void {
  try {
    localStorage.removeItem(RECENT_SEARCHES_KEY)
  } catch {}
}
