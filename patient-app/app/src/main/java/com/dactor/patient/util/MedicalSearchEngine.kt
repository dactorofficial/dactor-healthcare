package com.dactor.patient.util

import com.dactor.patient.data.model.Clinic
import com.dactor.patient.data.model.Doctor
import com.dactor.patient.data.model.ClinicService
import java.util.Locale

data class SearchMatchResult(
    val isMatch: Boolean,
    val score: Int = 0,
    val matchedDoctors: List<Doctor> = emptyList(),
    val matchHighlightReason: String? = null
)

object MedicalSearchEngine {

    // Layman symptom, organ, and condition mapping to medical specialty stems
    private val synonymMap: Map<String, List<String>> = mapOf(
        // Dermatology / Skin
        "skin" to listOf("dermatol", "skin", "cosmetol", "venereol", "derma"),
        "acne" to listOf("dermatol", "skin", "cosmetol"),
        "pimple" to listOf("dermatol", "skin"),
        "pimples" to listOf("dermatol", "skin"),
        "rash" to listOf("dermatol", "skin", "allergy"),
        "rashes" to listOf("dermatol", "skin", "allergy"),
        "allergy" to listOf("dermatol", "allergy", "immunol", "pulmon"),
        "hair" to listOf("dermatol", "trichol", "hair"),
        "scalp" to listOf("dermatol", "skin"),
        "eczema" to listOf("dermatol", "skin"),
        "dermatology" to listOf("dermatol", "skin"),
        "dermatologist" to listOf("dermatol", "skin"),

        // Cardiology / Heart
        "heart" to listOf("cardio", "heart", "internal medicine"),
        "cardiac" to listOf("cardio", "heart"),
        "chest pain" to listOf("cardio", "pulmon", "internal medicine"),
        "bp" to listOf("cardio", "internal medicine", "physician"),
        "hypertension" to listOf("cardio", "internal medicine"),
        "blood pressure" to listOf("cardio", "internal medicine"),
        "cardiologist" to listOf("cardio", "heart"),
        "cardiology" to listOf("cardio", "heart"),

        // Orthopedics / Bone & Joints
        "bone" to listOf("ortho", "bone", "joint", "physiotherap"),
        "bones" to listOf("ortho", "bone", "joint"),
        "joint" to listOf("ortho", "rheumatol", "joint"),
        "joints" to listOf("ortho", "rheumatol"),
        "fracture" to listOf("ortho", "trauma", "bone"),
        "knee" to listOf("ortho", "joint", "physiotherap"),
        "spine" to listOf("ortho", "neuro", "spine"),
        "back pain" to listOf("ortho", "physiotherap", "spine"),
        "arthritis" to listOf("ortho", "rheumatol"),
        "ligament" to listOf("ortho", "sports medicine"),
        "orthopedic" to listOf("ortho", "bone"),
        "orthopedics" to listOf("ortho", "bone"),
        "orthopedician" to listOf("ortho", "bone"),

        // Ophthalmology / Eye
        "eye" to listOf("ophthalm", "eye", "optom", "vision"),
        "eyes" to listOf("ophthalm", "eye", "optom"),
        "vision" to listOf("ophthalm", "eye", "optom"),
        "cataract" to listOf("ophthalm", "eye"),
        "glasses" to listOf("optom", "ophthalm", "eye"),
        "spectacle" to listOf("optom", "ophthalm"),
        "retina" to listOf("ophthalm", "retina"),
        "ophthalmologist" to listOf("ophthalm", "eye"),
        "ophthalmology" to listOf("ophthalm", "eye"),

        // Dental
        "tooth" to listOf("dent", "oral", "maxillofac"),
        "teeth" to listOf("dent", "oral"),
        "dental" to listOf("dent", "oral"),
        "dentist" to listOf("dent", "oral"),
        "gum" to listOf("dent", "periodont"),
        "cavity" to listOf("dent", "oral"),
        "root canal" to listOf("dent", "endodont"),
        "braces" to listOf("dent", "orthodont"),

        // Pediatrics / Child
        "child" to listOf("pediatr", "child", "neonat"),
        "children" to listOf("pediatr", "child"),
        "baby" to listOf("pediatr", "neonat", "child"),
        "kid" to listOf("pediatr", "child"),
        "kids" to listOf("pediatr", "child"),
        "infant" to listOf("pediatr", "neonat"),
        "newborn" to listOf("neonat", "pediatr"),
        "vaccine" to listOf("pediatr", "immuniz", "general"),
        "vaccination" to listOf("pediatr", "immuniz", "general"),
        "pediatrician" to listOf("pediatr", "child"),
        "pediatrics" to listOf("pediatr", "child"),

        // ENT
        "ear" to listOf("ent", "otolaryng", "ear"),
        "nose" to listOf("ent", "rhinol", "nose"),
        "throat" to listOf("ent", "laryngol", "throat"),
        "ent" to listOf("ent", "otolaryng", "ear", "nose", "throat"),
        "sinus" to listOf("ent", "rhinol"),
        "hearing" to listOf("ent", "audiol"),
        "tonsil" to listOf("ent", "throat"),

        // Gynecology & Obstetrics
        "women" to listOf("gynec", "obstetr", "obgyn", "women"),
        "female" to listOf("gynec", "obstetr", "obgyn"),
        "pregnancy" to listOf("obstetr", "gynec", "matern"),
        "pregnant" to listOf("obstetr", "gynec"),
        "period" to listOf("gynec", "menstru"),
        "menstrual" to listOf("gynec"),
        "gynecologist" to listOf("gynec", "obstetr", "obgyn"),
        "gynecology" to listOf("gynec", "obstetr", "obgyn"),
        "delivery" to listOf("obstetr", "matern"),

        // Neurology / Brain
        "brain" to listOf("neuro", "brain"),
        "nerve" to listOf("neuro", "nerve"),
        "nerves" to listOf("neuro"),
        "headache" to listOf("neuro", "general", "physician"),
        "migraine" to listOf("neuro"),
        "stroke" to listOf("neuro"),
        "paralysis" to listOf("neuro", "physiotherap"),
        "seizure" to listOf("neuro", "epilep"),
        "neurologist" to listOf("neuro", "brain"),
        "neurology" to listOf("neuro", "brain"),

        // Psychiatry / Mind
        "mind" to listOf("psychiatr", "psycholog", "mental"),
        "mental" to listOf("psychiatr", "psycholog", "mental"),
        "depression" to listOf("psychiatr", "psycholog", "mental"),
        "anxiety" to listOf("psychiatr", "psycholog"),
        "stress" to listOf("psychiatr", "psycholog"),
        "sleep" to listOf("psychiatr", "neuro", "pulmon"),
        "insomnia" to listOf("psychiatr", "neuro"),
        "psychiatrist" to listOf("psychiatr", "mental"),
        "psychiatry" to listOf("psychiatr", "mental"),

        // Gastroenterology / Stomach
        "stomach" to listOf("gastro", "digest", "internal medicine"),
        "digest" to listOf("gastro", "digest"),
        "digestion" to listOf("gastro", "digest"),
        "gastric" to listOf("gastro", "acidity"),
        "acidity" to listOf("gastro", "internal medicine"),
        "liver" to listOf("hepatol", "gastro"),
        "constipation" to listOf("gastro"),
        "diarrhea" to listOf("gastro", "general"),
        "gastroenterologist" to listOf("gastro", "digest"),
        "gastroenterology" to listOf("gastro", "digest"),

        // Nephrology & Urology / Kidney
        "kidney" to listOf("nephro", "uro", "kidney", "renal"),
        "urine" to listOf("uro", "nephro"),
        "urinary" to listOf("uro", "nephro"),
        "stone" to listOf("uro", "nephro", "surgeon"),
        "prostate" to listOf("uro"),
        "dialysis" to listOf("nephro"),
        "nephrologist" to listOf("nephro", "kidney"),
        "urologist" to listOf("uro", "urinary"),

        // Oncology / Cancer
        "cancer" to listOf("oncol", "cancer", "tumor"),
        "tumor" to listOf("oncol", "surgeon"),
        "chemo" to listOf("oncol"),
        "oncologist" to listOf("oncol", "cancer"),
        "oncology" to listOf("oncol", "cancer"),

        // Pulmonology / Lungs & Chest
        "lungs" to listOf("pulmon", "chest", "respirat"),
        "breath" to listOf("pulmon", "respirat"),
        "breathing" to listOf("pulmon", "respirat"),
        "asthma" to listOf("pulmon", "allergy"),
        "tb" to listOf("pulmon", "tubercul", "chest"),
        "tuberculosis" to listOf("pulmon", "tubercul"),
        "pulmonologist" to listOf("pulmon", "chest"),
        "pulmonology" to listOf("pulmon", "chest"),

        // Endocrinology / Diabetes & Thyroid
        "sugar" to listOf("endocrin", "diabet", "internal medicine"),
        "diabetes" to listOf("endocrin", "diabet", "internal medicine"),
        "diabetic" to listOf("endocrin", "diabet"),
        "thyroid" to listOf("endocrin", "internal medicine"),
        "hormone" to listOf("endocrin"),
        "endocrinologist" to listOf("endocrin"),

        // General Medicine
        "fever" to listOf("general", "internal medicine", "physician"),
        "cold" to listOf("general", "physician", "ent"),
        "cough" to listOf("general", "pulmon", "physician"),
        "general" to listOf("general", "internal medicine", "physician"),
        "physician" to listOf("physician", "general", "internal medicine"),
        "checkup" to listOf("general", "internal medicine"),

        // Pathology & Lab Tests
        "blood" to listOf("patholog", "lab", "diagnostic", "hematol", "cbc", "blood"),
        "blood test" to listOf("lab", "patholog", "diagnostic", "cbc", "hematol"),
        "test" to listOf("lab", "patholog", "diagnostic", "test"),
        "lab" to listOf("lab", "patholog", "diagnostic"),
        "pathology" to listOf("patholog", "lab", "diagnostic"),
        "cbc" to listOf("cbc", "blood", "lab", "patholog", "hematol"),
        "complete blood count" to listOf("cbc", "blood", "lab", "patholog"),
        "hemoglobin" to listOf("cbc", "blood", "lab", "patholog"),
        "platelet" to listOf("cbc", "blood", "lab", "patholog"),
        "platelets" to listOf("cbc", "blood", "lab", "patholog"),
        "thyroid" to listOf("thyroid", "tsh", "lab", "endocrin"),
        "tsh" to listOf("thyroid", "tsh", "lab"),
        "lipid" to listOf("lipid", "cholesterol", "lab", "cardio"),
        "cholesterol" to listOf("lipid", "cholesterol", "lab"),
        "urine" to listOf("urine", "urinalysis", "lab", "uro"),
        "urinalysis" to listOf("urine", "urinalysis", "lab"),
        "glucose" to listOf("glucose", "sugar", "fbs", "lab", "diabet"),
        "sugar test" to listOf("glucose", "sugar", "fbs", "lab"),
        "fbs" to listOf("glucose", "sugar", "fbs", "lab"),
        "hba1c" to listOf("glucose", "sugar", "hba1c", "lab"),
        "lft" to listOf("lft", "liver", "lab", "hepatol"),
        "kft" to listOf("kft", "kidney", "renal", "lab", "nephro"),
        "creatinine" to listOf("kft", "kidney", "renal", "lab"),

        // Radiology, Scans & Diagnostic Imaging
        "xray" to listOf("xray", "x-ray", "radiolog", "radiograph", "imaging", "diagnostic", "lab"),
        "x-ray" to listOf("xray", "x-ray", "radiolog", "radiograph", "imaging", "diagnostic", "lab"),
        "digital x-ray" to listOf("xray", "x-ray", "radiolog", "imaging"),
        "ultrasound" to listOf("ultrasound", "usg", "sonolog", "radiolog", "imaging", "diagnostic", "lab"),
        "usg" to listOf("ultrasound", "usg", "sonolog", "radiolog", "imaging", "diagnostic", "lab"),
        "sonography" to listOf("ultrasound", "usg", "sonolog", "imaging"),
        "ct" to listOf("ct", "ct scan", "computed tomography", "radiolog", "imaging", "scan", "diagnostic", "lab"),
        "ct scan" to listOf("ct", "ct scan", "computed tomography", "radiolog", "imaging", "scan", "diagnostic", "lab"),
        "computed tomography" to listOf("ct", "ct scan", "radiolog", "imaging"),
        "mri" to listOf("mri", "magnetic resonance", "radiolog", "imaging", "scan", "diagnostic", "lab"),
        "mri scan" to listOf("mri", "magnetic resonance", "radiolog", "imaging", "scan", "diagnostic", "lab"),
        "magnetic resonance" to listOf("mri", "imaging", "radiolog"),
        "scan" to listOf("scan", "mri", "ct", "ultrasound", "radiolog", "imaging"),
        "ecg" to listOf("ecg", "ekg", "electrocardiogram", "cardio", "heart", "diagnostic", "lab"),
        "ekg" to listOf("ecg", "ekg", "electrocardiogram", "cardio", "heart", "diagnostic", "lab"),
        "echo" to listOf("echo", "echocardiograph", "cardio", "heart", "diagnostic", "lab"),
        "echocardiogram" to listOf("echo", "echocardiograph", "cardio", "diagnostic"),
        "echocardiography" to listOf("echo", "echocardiograph", "cardio", "diagnostic"),
        "endoscopy" to listOf("endoscop", "colonoscop", "gastro", "diagnostic", "lab"),
        "colonoscopy" to listOf("colonoscop", "endoscop", "gastro", "diagnostic"),
        "mammography" to listOf("mammograph", "breast", "radiolog", "imaging", "scan"),
        "mammogram" to listOf("mammograph", "breast", "radiolog", "imaging"),
        "biopsy" to listOf("biopsy", "histopathol", "patholog", "lab"),
        "histopathology" to listOf("histopathol", "cytol", "patholog", "lab"),
        "cytology" to listOf("cytol", "histopathol", "patholog", "lab"),

        // Surgery
        "surgery" to listOf("surgeon", "surgery", "surgical"),
        "surgeon" to listOf("surgeon", "surgery"),
        "operation" to listOf("surgeon", "surgery"),

        // Physiotherapy
        "physio" to listOf("physiotherap", "rehab"),
        "physiotherapy" to listOf("physiotherap", "rehab")
    )

    // Symptom / Keyword to Human-Readable Specialist Suggestions (e.g., "skin" -> "Dermatologist")
    private val symptomToSpecialistSuggestions: Map<String, List<String>> = mapOf(
        "skin" to listOf("Dermatologist", "Dermatology", "Cosmetologist"),
        "derma" to listOf("Dermatologist", "Dermatology"),
        "acne" to listOf("Dermatologist", "Cosmetologist"),
        "pimple" to listOf("Dermatologist"),
        "rash" to listOf("Dermatologist", "Allergist"),
        "allergy" to listOf("Dermatologist", "Allergist", "Pulmonologist"),
        "hair" to listOf("Dermatologist", "Trichologist"),
        "eczema" to listOf("Dermatologist"),
        "fungal" to listOf("Dermatologist"),
        "itch" to listOf("Dermatologist"),

        "heart" to listOf("Cardiologist", "Cardiology", "Internal Medicine"),
        "cardio" to listOf("Cardiologist", "Cardiology"),
        "chest" to listOf("Cardiologist", "Pulmonologist", "General Physician"),
        "bp" to listOf("Cardiologist", "General Physician"),
        "pressure" to listOf("Cardiologist", "Internal Medicine"),
        "hypertension" to listOf("Cardiologist", "Internal Medicine"),

        "bone" to listOf("Orthopedic", "Orthopedician", "Physiotherapist"),
        "ortho" to listOf("Orthopedic", "Orthopedician"),
        "joint" to listOf("Orthopedic", "Rheumatologist"),
        "fracture" to listOf("Orthopedic", "Trauma Surgeon"),
        "knee" to listOf("Orthopedic", "Physiotherapist"),
        "back" to listOf("Orthopedic", "Spine Specialist", "Physiotherapist"),
        "spine" to listOf("Orthopedic", "Neurologist"),
        "arthritis" to listOf("Orthopedic", "Rheumatologist"),

        "eye" to listOf("Ophthalmologist", "Optometrist", "Eye Specialist"),
        "vision" to listOf("Ophthalmologist", "Optometrist"),
        "cataract" to listOf("Ophthalmologist"),
        "retina" to listOf("Ophthalmologist"),

        "tooth" to listOf("Dentist", "Dental Surgeon"),
        "teeth" to listOf("Dentist", "Dental Surgeon", "Orthodontist"),
        "dent" to listOf("Dentist", "Dental Care"),
        "gum" to listOf("Dentist", "Periodontist"),
        "cavity" to listOf("Dentist"),

        "child" to listOf("Pediatrician", "Pediatrics", "Child Specialist"),
        "baby" to listOf("Pediatrician", "Neonatologist"),
        "kid" to listOf("Pediatrician", "Child Specialist"),
        "infant" to listOf("Pediatrician", "Neonatologist"),
        "pediatr" to listOf("Pediatrician", "Pediatrics"),
        "vaccine" to listOf("Pediatrician", "General Physician"),

        "ear" to listOf("ENT Specialist", "Otolaryngologist"),
        "nose" to listOf("ENT Specialist", "Otolaryngologist"),
        "throat" to listOf("ENT Specialist", "Otolaryngologist"),
        "ent" to listOf("ENT Specialist", "Otolaryngologist"),
        "sinus" to listOf("ENT Specialist"),
        "tonsil" to listOf("ENT Specialist"),

        "women" to listOf("Gynecologist", "Obstetrician", "OB-GYN"),
        "female" to listOf("Gynecologist", "OB-GYN"),
        "pregnan" to listOf("Gynecologist", "Obstetrician"),
        "period" to listOf("Gynecologist"),
        "gynec" to listOf("Gynecologist", "Obstetrician"),

        "brain" to listOf("Neurologist", "Neurosurgeon"),
        "nerve" to listOf("Neurologist"),
        "headache" to listOf("Neurologist", "General Physician"),
        "migraine" to listOf("Neurologist"),
        "neuro" to listOf("Neurologist", "Neurology"),
        "stroke" to listOf("Neurologist"),

        "mind" to listOf("Psychiatrist", "Psychologist"),
        "mental" to listOf("Psychiatrist", "Psychologist"),
        "depress" to listOf("Psychiatrist", "Psychologist"),
        "anxiet" to listOf("Psychiatrist", "Psychologist"),
        "stress" to listOf("Psychiatrist", "Psychologist"),
        "sleep" to listOf("Psychiatrist", "Neurologist"),

        "stomach" to listOf("Gastroenterologist", "General Physician"),
        "gastric" to listOf("Gastroenterologist", "Internal Medicine"),
        "digest" to listOf("Gastroenterologist"),
        "liver" to listOf("Gastroenterologist", "Hepatologist"),
        "acidity" to listOf("Gastroenterologist", "General Physician"),

        "kidney" to listOf("Nephrologist", "Urologist"),
        "urine" to listOf("Urologist", "Nephrologist"),
        "stone" to listOf("Urologist", "General Surgeon"),

        "cancer" to listOf("Oncologist", "Oncology"),
        "tumor" to listOf("Oncologist", "Surgeon"),

        "lung" to listOf("Pulmonologist", "Chest Specialist"),
        "breath" to listOf("Pulmonologist"),
        "asthma" to listOf("Pulmonologist"),
        "cough" to listOf("General Physician", "Pulmonologist"),

        "sugar" to listOf("Endocrinologist", "Diabetologist", "Internal Medicine"),
        "diabet" to listOf("Endocrinologist", "Diabetologist"),
        "thyroid" to listOf("Endocrinologist", "Internal Medicine"),

        "fever" to listOf("General Physician", "Internal Medicine"),
        "cold" to listOf("General Physician", "ENT Specialist"),
        "flu" to listOf("General Physician"),
        "general" to listOf("General Physician", "Internal Medicine"),
        "physician" to listOf("General Physician", "Internal Medicine"),
        "physio" to listOf("Physiotherapist", "Rehabilitation"),

        // Lab tests & Scans suggestions
        "mri" to listOf("MRI (Magnetic Resonance)", "Diagnostic Lab", "Radiology & Imaging"),
        "ct" to listOf("CT Scan (Computed Tomography)", "Diagnostic Lab", "Radiology & Imaging"),
        "scan" to listOf("MRI Scan", "CT Scan", "Ultrasound (USG)", "Radiology"),
        "xray" to listOf("Digital X-Ray", "Radiology & Imaging", "Diagnostic Lab"),
        "x-ray" to listOf("Digital X-Ray", "Radiology & Imaging", "Diagnostic Lab"),
        "usg" to listOf("Ultrasound (USG)", "Sonography", "Diagnostic Lab"),
        "ultrasound" to listOf("Ultrasound (USG)", "Sonography", "Diagnostic Lab"),
        "sonography" to listOf("Ultrasound (USG)", "Diagnostic Lab"),
        "blood" to listOf("Blood Tests & CBC", "Pathology Lab", "Hematology"),
        "cbc" to listOf("Complete Blood Count (CBC)", "Pathology Lab"),
        "ecg" to listOf("ECG (Electrocardiogram)", "Cardiology Lab", "Diagnostic Lab"),
        "ekg" to listOf("ECG (Electrocardiogram)", "Cardiology Lab"),
        "echo" to listOf("Echocardiography (Echo)", "Cardiology Lab"),
        "endoscopy" to listOf("Endoscopy", "Gastroenterologist", "Diagnostic Lab"),
        "mammography" to listOf("Mammography", "Radiology & Imaging", "Diagnostic Lab"),
        "biopsy" to listOf("Pathology & Biopsy", "Histopathology Lab")
    )

    private val suggestedSpecialtiesCache = java.util.concurrent.ConcurrentHashMap<String, List<String>>()
    private val expandedStemsCache = java.util.concurrent.ConcurrentHashMap<String, Set<String>>()

    /**
     * Returns suggested specialist titles for a user's search query.
     * e.g. searching "skin" immediately returns ["Dermatologist", "Dermatology", "Cosmetologist"]
     */
    fun getSuggestedSpecialties(query: String): List<String> {
        val clean = query.replace(Regex("[^a-zA-Z0-9\\s]"), " ").trim().lowercase(Locale.ROOT)
        if (clean.length < 2) return emptyList()
        suggestedSpecialtiesCache[clean]?.let { return it }

        val suggestions = linkedSetOf<String>()
        val tokens = clean.split("\\s+".toRegex()).filter { it.length >= 2 }

        // Direct or prefix match against symptomToSpecialistSuggestions keys
        for ((key, specialists) in symptomToSpecialistSuggestions) {
            if (key == clean || key.startsWith(clean) || clean.contains(key) ||
                tokens.any { tok -> key == tok || key.startsWith(tok) || tok.contains(key) }
            ) {
                suggestions.addAll(specialists)
            }
        }

        // Also check if any specialist name itself matches the query prefix
        if (suggestions.isEmpty()) {
            for (specialists in symptomToSpecialistSuggestions.values) {
                for (spec in specialists) {
                    if (spec.lowercase(Locale.ROOT).contains(clean)) {
                        suggestions.add(spec)
                    }
                }
            }
        }

        val result = suggestions.toList()
        suggestedSpecialtiesCache[clean] = result
        return result
    }

    /**
     * Expands a search query into searchable stems/keywords.
     * e.g. "skin" -> ["skin", "dermatol", "cosmetol", "venereol", "derma", "dermatologist"]
     */
    fun expandQuery(query: String): Set<String> {
        val clean = query.replace(Regex("[^a-zA-Z0-9\\s]"), " ").trim().lowercase(Locale.ROOT)
        if (clean.isBlank()) return emptySet()
        expandedStemsCache[clean]?.let { return it }

        val tokens = clean.split("\\s+".toRegex()).filter { it.isNotBlank() }
        val stems = mutableSetOf<String>()
        stems.add(clean)
        stems.addAll(tokens)

        // Add whole query synonyms & prefix matches
        for ((key, syns) in synonymMap) {
            if (key == clean || (clean.length >= 3 && key.startsWith(clean)) || clean.contains(key)) {
                stems.addAll(syns)
            }
        }

        // Add token-by-token synonyms
        for (token in tokens) {
            synonymMap[token]?.let { stems.addAll(it) }
            if (token.length >= 3) {
                for ((key, syns) in synonymMap) {
                    if (key.startsWith(token)) {
                        stems.addAll(syns)
                    }
                }
            }
        }

        // Also include suggested specialty stems
        getSuggestedSpecialties(clean).forEach { spec ->
            stems.add(spec.lowercase(Locale.ROOT))
        }

        expandedStemsCache[clean] = stems
        return stems
    }

    /**
     * Matches an individual Doctor (and their associated clinics) against a user search query.
     */
    fun matchDoctor(
        doctor: Doctor,
        clinics: List<Clinic>,
        query: String
    ): SearchMatchResult {
        val q = query.trim().lowercase(Locale.ROOT)
        if (q.isBlank()) return SearchMatchResult(isMatch = true, score = 50, matchedDoctors = listOf(doctor))

        val corpus = OpenRouteSpatialEngine.getDoctorCorpus(doctor, clinics)
        val expandedStems = expandQuery(q)

        // Fast O(1) rejection against pre-indexed combined corpus before detailed scoring
        val anyStemInCorpus = corpus.combinedCorpus.contains(q) || expandedStems.any { corpus.combinedCorpus.contains(it) }
        if (!anyStemInCorpus) {
            return SearchMatchResult(isMatch = false, score = 0)
        }

        val suggestedSpecs = getSuggestedSpecialties(q)
        var score = 0
        var highlightReason: String? = null

        val docNameLower = corpus.nameLower
        val allDocSpecText = corpus.allSpecsLower
        val docBioLower = corpus.bioLower
        val docEduLower = corpus.eduLower

        // Ranked strictly in order:
        // 1. Specialty or symptom keywords ("skin", "child", "eye")
        if (allDocSpecText.contains(q)) {
            score += 150
            if (highlightReason == null) {
                highlightReason = "Specialist: ${doctor.specialty ?: doctor.specialties.firstOrNull() ?: "Specialist"}"
            }
        }
        for (stem in expandedStems) {
            if (allDocSpecText.contains(stem)) {
                score += 140
                if (highlightReason == null) {
                    val matchedSug = suggestedSpecs.firstOrNull() ?: doctor.specialty ?: "Specialist"
                    highlightReason = "Suggested for '$query': $matchedSug"
                }
                break
            }
            if (docBioLower.contains(stem) || docEduLower.contains(stem)) {
                score += 125
                if (highlightReason == null) {
                    highlightReason = "Recommended ${doctor.specialty ?: "Specialist"} for '$query'"
                }
                break
            }
        }

        // 2. Doctor name
        if (docNameLower.contains(q) || "dr. $docNameLower".contains(q)) {
            score += 120
            if (highlightReason == null) {
                highlightReason = "Matched Doctor: Dr. ${doctor.fullName}"
            }
        } else {
            for (stem in expandedStems) {
                if (docNameLower.contains(stem)) {
                    score += 110
                    if (highlightReason == null) {
                        highlightReason = "Matched Doctor: Dr. ${doctor.fullName}"
                    }
                    break
                }
            }
        }

        // 3. Clinic name & 4. Location or area
        if (corpus.clinicsJoinedLower.contains(q) || expandedStems.any { corpus.clinicsJoinedLower.contains(it) }) {
            for (clinic in clinics) {
                val cName = clinic.name.lowercase(Locale.ROOT)
                val cAddr = (clinic.addressText ?: "").lowercase(Locale.ROOT)
                val cSpecs = clinic.specialties.joinToString(" ").lowercase(Locale.ROOT)
                for (stem in expandedStems) {
                    if (cSpecs.contains(stem)) {
                        score += 130
                        if (highlightReason == null) {
                            highlightReason = "${doctor.specialty ?: "Doctor"} at ${clinic.name}"
                        }
                        break
                    }
                }
                if (cName.contains(q)) {
                    score += 95
                    if (highlightReason == null) {
                        highlightReason = "Practices at ${clinic.name}"
                    }
                    break
                }
                if (cAddr.contains(q)) {
                    score += 75
                    if (highlightReason == null) {
                        highlightReason = "Area: ${clinic.addressText ?: clinic.name}"
                    }
                    break
                }
            }
        }

        return SearchMatchResult(
            isMatch = score > 0,
            score = score,
            matchedDoctors = if (score > 0) listOf(doctor) else emptyList(),
            matchHighlightReason = highlightReason
        )
    }

    /**
     * Matches a clinic, its doctors, and its services against a user search query.
     * Ranked in order:
     * 1. Specialty or symptom keywords ("skin", "child", "eye")
     * 2. Doctor name
     * 3. Clinic name
     * 4. Location or area
     */
    fun matchClinic(
        clinic: Clinic,
        doctors: List<Doctor>,
        services: List<ClinicService>,
        query: String
    ): SearchMatchResult {
        val q = query.trim().lowercase(Locale.ROOT)
        if (q.isBlank()) return SearchMatchResult(isMatch = true, score = 0)

        val corpus = OpenRouteSpatialEngine.getClinicCorpus(clinic, doctors, services)
        val expandedStems = expandQuery(q)

        // Fast O(1) rejection against pre-indexed combined corpus before detailed scoring
        val anyStemInCorpus = corpus.combinedCorpus.contains(q) || expandedStems.any { corpus.combinedCorpus.contains(it) }
        if (!anyStemInCorpus) {
            return SearchMatchResult(isMatch = false, score = 0)
        }
        val suggestedSpecs = getSuggestedSpecialties(q)
        var score = 0
        var highlightReason: String? = null
        val matchedDocs = mutableListOf<Doctor>()

        val clinicNameLower = clinic.name.lowercase(Locale.ROOT)
        val clinicAddrLower = (clinic.addressText ?: "").lowercase(Locale.ROOT)
        val clinicTypeLower = (clinic.type ?: "").lowercase(Locale.ROOT)
        val clinicDescLower = (clinic.description ?: "").lowercase(Locale.ROOT)

        // 1. Specialty or symptom keywords (Clinic & Doctor Specialties) — Highest rank
        for (cSpec in clinic.specialties) {
            val cSpecLower = cSpec.lowercase(Locale.ROOT)
            if (cSpecLower.contains(q)) {
                score += 150
                if (highlightReason == null) highlightReason = "Specialty: $cSpec"
            } else {
                for (stem in expandedStems) {
                    if (cSpecLower.contains(stem)) {
                        score += 140
                        if (highlightReason == null) {
                            val sug = suggestedSpecs.firstOrNull() ?: cSpec
                            highlightReason = "Suggested ($sug): $cSpec"
                        }
                        break
                    }
                }
            }
        }

        // 1b & 2. Doctor Specialty/Symptom Keywords (Rank 1) & Doctor Name (Rank 2)
        for (doc in doctors) {
            val docNameLower = doc.fullName.lowercase(Locale.ROOT)
            val docSpecLower = (doc.specialty ?: "").lowercase(Locale.ROOT)
            val docSpecsListLower = doc.specialties.map { it.lowercase(Locale.ROOT) }
            val allDocSpecs = (listOf(docSpecLower) + docSpecsListLower).joinToString(" ")
            val docBioLower = (doc.bio ?: "").lowercase(Locale.ROOT)

            var docMatched = false

            // Rank 1: Doctor Specialty exact or symptom stem match
            if (allDocSpecs.contains(q)) {
                score += 145
                docMatched = true
                if (highlightReason == null) highlightReason = "Specialist: ${doc.specialty ?: doc.specialties.firstOrNull()} (Dr. ${doc.fullName})"
            } else {
                for (stem in expandedStems) {
                    if (allDocSpecs.contains(stem) || docBioLower.contains(stem)) {
                        score += 135
                        docMatched = true
                        if (highlightReason == null) {
                            val displaySpec = doc.specialty?.takeIf { it.isNotBlank() }
                                ?: suggestedSpecs.firstOrNull()
                                ?: "Specialist"
                            highlightReason = "Has $displaySpec: Dr. ${doc.fullName}"
                        }
                        break
                    }
                }
            }

            // Rank 2: Doctor Name match
            if (docNameLower.contains(q) || "dr. $docNameLower".contains(q)) {
                score += 120
                docMatched = true
                if (highlightReason == null) highlightReason = "Matched Doctor: Dr. ${doc.fullName}"
            } else {
                for (stem in expandedStems) {
                    if (docNameLower.contains(stem)) {
                        score += 110
                        docMatched = true
                        if (highlightReason == null) highlightReason = "Matched Doctor: Dr. ${doc.fullName}"
                        break
                    }
                }
            }

            if (docMatched) {
                matchedDocs.add(doc)
            }
        }

        // 3. Clinic Name (Rank 3)
        if (clinicNameLower.contains(q)) {
            score += 95
            if (highlightReason == null) highlightReason = "Matched Clinic Name: ${clinic.name}"
        } else {
            for (stem in expandedStems) {
                if (clinicNameLower.contains(stem)) {
                    score += 85
                    if (highlightReason == null) highlightReason = "Clinic Name Match: ${clinic.name}"
                    break
                }
            }
        }

        // 4. Location or Area (Rank 4)
        if (clinicAddrLower.contains(q)) {
            score += 75
            if (highlightReason == null) highlightReason = "Matched Location: ${clinic.addressText}"
        } else {
            for (stem in expandedStems) {
                if (clinicAddrLower.contains(stem)) {
                    score += 65
                    if (highlightReason == null) highlightReason = "Location Match: ${clinic.addressText}"
                    break
                }
            }
        }

        // 5. Service / Diagnostic Lab Test matching
        val isLabClinic = (clinic.type ?: "").contains("lab", ignoreCase = true) || (clinic.type ?: "").equals("diagnostic_lab", ignoreCase = true)
        val testServices = if (isLabClinic && services.isEmpty()) {
            listOf(
                ClinicService(id = "def_cbc", clinicId = clinic.id, serviceName = "Complete Blood Count (CBC)", description = "Includes Hb, TLC, DLC, Platelets", price = 350.0),
                ClinicService(id = "def_lipid", clinicId = clinic.id, serviceName = "Lipid Profile", description = "Cholesterol, Triglycerides, HDL, LDL", price = 650.0),
                ClinicService(id = "def_thyroid", clinicId = clinic.id, serviceName = "Thyroid Profile (T3, T4, TSH)", description = "Full thyroid screening", price = 800.0),
                ClinicService(id = "def_urine", clinicId = clinic.id, serviceName = "Urine Routine & Microscopic", description = "Complete urine examination", price = 200.0),
                ClinicService(id = "def_glucose", clinicId = clinic.id, serviceName = "Fasting Blood Sugar (FBS)", description = "Blood glucose test", price = 150.0)
            )
        } else services

        for (srv in testServices) {
            val srvLower = srv.serviceName.lowercase(Locale.ROOT)
            val srvDescLower = (srv.description ?: "").lowercase(Locale.ROOT)
            if (srvLower.contains(q) || (q.length >= 3 && srvDescLower.contains(q))) {
                score += if (isLabClinic) 115 else 60
                if (highlightReason == null) {
                    highlightReason = if (isLabClinic) "Offers Lab Test: ${srv.serviceName} (Rs. ${srv.price.toInt()})" else "Service Offered: ${srv.serviceName}"
                }
            } else {
                for (stem in expandedStems) {
                    if (srvLower.contains(stem) || (stem.length >= 3 && srvDescLower.contains(stem))) {
                        score += if (isLabClinic) 95 else 50
                        if (highlightReason == null) {
                            highlightReason = if (isLabClinic) "Offers Lab Test: ${srv.serviceName} (Rs. ${srv.price.toInt()})" else "Service Offered: ${srv.serviceName}"
                        }
                        break
                    }
                }
            }
        }

        // 6. Fallback: description or type
        for (stem in expandedStems) {
            if (clinicDescLower.contains(stem)) {
                score += 35
                if (highlightReason == null) highlightReason = "Clinic Specialty Match: ${clinic.name}"
            }
            if (clinicTypeLower.contains(stem)) {
                score += 20
            }
        }

        val isMatch = score > 0
        return SearchMatchResult(
            isMatch = isMatch,
            score = score,
            matchedDoctors = matchedDocs.distinctBy { it.id },
            matchHighlightReason = highlightReason
        )
    }

    /**
     * Recommended search suggestion chips to help the patient find common specialties.
     */
    val quickSpecialtySuggestions = listOf(
        "Skin / Dermatologist",
        "Heart / Cardiologist",
        "Bone & Joint (Ortho)",
        "Dental Care",
        "Child / Pediatrician",
        "Eye Specialist",
        "Women / Gynecologist",
        "ENT Specialist",
        "General Physician"
    )
}

