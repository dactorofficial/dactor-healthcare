-- =========================================================================
-- DACTOR — Master Medical Taxonomy & Educational Qualifications Schema
-- =========================================================================

-- 1. Create medical_specialties table
CREATE TABLE IF NOT EXISTS public.medical_specialties (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(150) NOT NULL UNIQUE,
    category VARCHAR(100) DEFAULT 'Specialized Care',
    description TEXT,
    search_keywords TEXT NOT NULL,
    icon VARCHAR(50) DEFAULT 'stethoscope',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Create medical_qualifications table
CREATE TABLE IF NOT EXISTS public.medical_qualifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    degree_name VARCHAR(150) NOT NULL UNIQUE,
    level VARCHAR(100) DEFAULT 'Postgraduate',
    field_of_study VARCHAR(150) DEFAULT 'Medicine',
    description TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Add specialties array column to clinics and doctors
ALTER TABLE public.clinics ADD COLUMN IF NOT EXISTS specialties TEXT[] DEFAULT '{}';
ALTER TABLE public.doctors ADD COLUMN IF NOT EXISTS specialties TEXT[] DEFAULT '{}';

-- 4. Enable RLS
ALTER TABLE public.medical_specialties ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.medical_qualifications ENABLE ROW LEVEL SECURITY;

-- 5. Policies for medical_specialties (Public read, full write for authenticated & anon admin)
DROP POLICY IF EXISTS "Public read medical_specialties" ON public.medical_specialties;
CREATE POLICY "Public read medical_specialties" ON public.medical_specialties FOR SELECT USING (true);

DROP POLICY IF EXISTS "Public insert medical_specialties" ON public.medical_specialties;
CREATE POLICY "Public insert medical_specialties" ON public.medical_specialties FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Public update medical_specialties" ON public.medical_specialties;
CREATE POLICY "Public update medical_specialties" ON public.medical_specialties FOR UPDATE USING (true);

DROP POLICY IF EXISTS "Public delete medical_specialties" ON public.medical_specialties;
CREATE POLICY "Public delete medical_specialties" ON public.medical_specialties FOR DELETE USING (true);

-- 6. Policies for medical_qualifications
DROP POLICY IF EXISTS "Public read medical_qualifications" ON public.medical_qualifications;
CREATE POLICY "Public read medical_qualifications" ON public.medical_qualifications FOR SELECT USING (true);

DROP POLICY IF EXISTS "Public insert medical_qualifications" ON public.medical_qualifications;
CREATE POLICY "Public insert medical_qualifications" ON public.medical_qualifications FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Public update medical_qualifications" ON public.medical_qualifications;
CREATE POLICY "Public update medical_qualifications" ON public.medical_qualifications FOR UPDATE USING (true);

DROP POLICY IF EXISTS "Public delete medical_qualifications" ON public.medical_qualifications;
CREATE POLICY "Public delete medical_qualifications" ON public.medical_qualifications FOR DELETE USING (true);

-- 7. Populate initial medical specialties
INSERT INTO public.medical_specialties (name, category, description, search_keywords, icon)
VALUES 
  ('Ophthalmology (Eye Care)', 'Eye & Vision', 'Diagnosis and treatment of eye disorders, vision testing, cataracts, and refractive surgery.', 'eye, vision, sight, cataract, glaucoma, cornea, retina, spectacles, glasses, blurry vision, optometry, ophthalmologist, red eye, eye strain, itching eyes, lasik, blind', 'Eye'),
  ('Dental Care & Dentistry', 'Dental & Oral', 'Oral healthcare, cavity prevention, root canals, braces, cosmetic dentistry, and dental surgery.', 'tooth, teeth, dentist, dental, cavity, gums, braces, root canal, rct, toothache, oral, cleaning, extraction, crown, implant, bleeding gums, jaw, orthodontist', 'Smile'),
  ('Dermatology & Skin Care', 'Skin & Hair', 'Treatment of skin diseases, hair loss, acne, eczema, psoriasis, rashes, and cosmetic skin care.', 'skin, rash, acne, pimples, eczema, psoriasis, hair loss, dermatologist, allergy, pigmentation, fungus, itch, itching, dandruff, mole, skin burn, scars', 'Sparkles'),
  ('Cardiology (Heart Care)', 'Heart & Vascular', 'Diagnosis and management of cardiovascular conditions, hypertension, heart attacks, and arrhythmias.', 'heart, chest pain, bp, blood pressure, hypertension, palpitations, cardiologist, ecg, cholesterol, cardiac, breathlessness, heart attack, pulse, angina', 'HeartPulse'),
  ('Orthopedics & Joint Care', 'Bone & Muscle', 'Musculoskeletal system care, fractures, arthritis, joint replacements, and sports injuries.', 'bone, joint, knee, spine, fracture, arthritis, back pain, neck pain, orthopedic, ligament, muscle, shoulder pain, hip pain, dislocation, osteoporosis, sprain', 'Bone'),
  ('Pediatrics & Child Health', 'Children & Infants', 'Specialized medical care and developmental tracking for infants, children, and adolescents.', 'child, baby, kid, pediatric, pediatrician, newborn, infant, vaccination, immunization, growth, fever in children, cough in child, toddler, neonatal', 'Baby'),
  ('ENT (Ear, Nose & Throat)', 'Head & Neck', 'Comprehensive treatment for ear infections, sinus disorders, hearing loss, and throat ailments.', 'ear, nose, throat, hearing, sinus, sinusitis, tonsils, dizziness, vertigo, earache, ent, tinnitus, nasal, running nose, hoarse voice, otolaryngologist', 'Activity'),
  ('Gynecology & Obstetrics', 'Women Health', 'Comprehensive female reproductive healthcare, prenatal care, childbirth, and hormonal care.', 'pregnancy, pregnant, delivery, period, menstrual, cramps, gynecologist, pcos, pcod, female, woman, uterus, ovarian, infertility, contraception, menopause', 'ShieldCheck'),
  ('General Medicine & Physician', 'Primary Care', 'Adult internal medicine, acute fevers, infections, chronic disease management, and preventive care.', 'fever, cough, cold, weakness, headache, infection, diabetes, sugar, thyroid, fatigue, general physician, nausea, vomiting, stomach pain, body ache, chills', 'Stethoscope'),
  ('Gastroenterology', 'Digestive Health', 'Disorders of the esophagus, stomach, intestines, liver, gallbladder, and pancreas.', 'stomach, digestion, acidity, gas, constipation, diarrhea, liver, jaundice, endoscopy, gastroenterologist, abdomen, ibs, bloating, gastritis, heartburn', 'Layers'),
  ('Neurology (Brain & Nerve)', 'Brain & Nervous System', 'Specialized diagnosis and treatment of brain, spinal cord, and peripheral nerve disorders.', 'brain, nerve, headache, migraine, stroke, paralysis, seizure, epilepsy, neurologist, numbness, tremors, memory loss, parkinson, fainting, neuropathy', 'Brain'),
  ('Psychiatry & Mental Health', 'Mental Wellness', 'Assessment and treatment of mental health, emotional wellness, mood, and sleep disorders.', 'mental, depression, anxiety, stress, sleep, insomnia, psychiatrist, mood, panic, counseling, psychology, bipolar, adhd, burnout, sadness, fear', 'SmilePlus'),
  ('Urology & Kidney Care', 'Kidney & Urinary', 'Urinary tract disorders in men and women, kidney stones, and male reproductive health.', 'urine, kidney, kidney stone, urinary, prostate, burning urine, urologist, bladder, incontinence, blood in urine, uti, frequent urination', 'Droplets'),
  ('Pulmonology (Lungs & Chest)', 'Respiratory Health', 'Respiratory disease management including asthma, chronic bronchitis, and pneumonia.', 'lungs, breathing, asthma, bronchitis, pneumonia, wheezing, cough, chest, pulmonologist, shortness of breath, respiratory, tb, tuberculosis', 'Wind'),
  ('Pathology & Diagnostic Lab', 'Laboratory & Tests', 'Laboratory blood analysis, biochemical tests, microbiologic testing, and tissue pathology.', 'blood test, lab, urine test, biopsy, cbc, thyroid test, lipid profile, hemoglobin, stool test, diagnostics, pathology, blood report, sugar test', 'FlaskConical'),
  ('Radiology & Imaging', 'Medical Imaging', 'Diagnostic imaging services including X-rays, Ultrasounds, CT Scans, and MRI.', 'x-ray, ultrasound, usg, mri, ct scan, scan, imaging, radiologist, sonography, ecg, echo, xray', 'Camera'),
  ('Physiotherapy & Rehab', 'Physical Therapy', 'Rehabilitative physical therapy, muscle rehabilitation, and mobility improvement.', 'physiotherapy, exercise, rehab, physical therapy, stiffness, post surgery, sports injury, paralysis rehab, back rehab, mobility, posture', 'Dumbbell'),
  ('Ayurveda & Holistic Medicine', 'Alternative Medicine', 'Traditional Ayurvedic diagnostic evaluations, herbal therapies, and holistic wellness.', 'ayurveda, herbal, naturopathy, panchakarma, natural, holistic, vata pitta kapha, ayurvedic doctor, herbal medicine', 'Leaf'),
  ('Oncology (Cancer Care)', 'Cancer Treatment', 'Medical, surgical, and radiation oncology services for comprehensive cancer therapy.', 'cancer, tumor, chemo, oncology, oncologist, radiation, biopsy, lump, chemotherapy, malignancy', 'ShieldAlert'),
  ('Endocrinology & Diabetes', 'Hormones & Metabolism', 'Management of hormonal imbalances, thyroid disorders, obesity, and diabetes.', 'diabetes, sugar, insulin, thyroid, hormone, endocrine, weight gain, metabolic, hba1c, hyperthyroid, hypothyroid', 'Scale')
ON CONFLICT (name) DO UPDATE SET 
  search_keywords = EXCLUDED.search_keywords,
  category = EXCLUDED.category,
  description = EXCLUDED.description;

-- 8. Populate initial medical qualifications
INSERT INTO public.medical_qualifications (degree_name, level, field_of_study, description)
VALUES 
  ('MBBS', 'Undergraduate', 'Medicine & Surgery', 'Bachelor of Medicine, Bachelor of Surgery (Primary medical qualification).'),
  ('BDS', 'Undergraduate', 'Dentistry', 'Bachelor of Dental Surgery (Primary dental qualification).'),
  ('BAMS', 'Undergraduate', 'Ayurveda', 'Bachelor of Ayurvedic Medicine and Surgery.'),
  ('MD - Internal Medicine', 'Postgraduate', 'General Medicine', 'Doctor of Medicine in Internal Medicine / Adult Healthcare.'),
  ('MD - Pediatrics', 'Postgraduate', 'Pediatrics', 'Doctor of Medicine in Child & Adolescent Healthcare.'),
  ('MD - Dermatology & Venereology', 'Postgraduate', 'Dermatology', 'Doctor of Medicine in Skin, Hair, and Venereal Diseases.'),
  ('MD - Psychiatry', 'Postgraduate', 'Psychiatry', 'Doctor of Medicine in Behavioral Sciences and Mental Health.'),
  ('MD - Radiodiagnosis', 'Postgraduate', 'Radiology', 'Doctor of Medicine in Medical Diagnostic Imaging.'),
  ('MD - Pathology', 'Postgraduate', 'Pathology', 'Doctor of Medicine in Laboratory and Tissue Diagnostics.'),
  ('MD - Anesthesiology & Critical Care', 'Postgraduate', 'Anesthesiology', 'Doctor of Medicine in Anesthesia and Intensive Care.'),
  ('MD - Pulmonology / Respiratory Medicine', 'Postgraduate', 'Pulmonology', 'Doctor of Medicine in Chest and Lung Diseases.'),
  ('MS - General Surgery', 'Postgraduate', 'General Surgery', 'Master of Surgery in General and Abdominal Surgery.'),
  ('MS - Orthopedics', 'Postgraduate', 'Orthopedics', 'Master of Surgery in Bone, Joint, and Spine Surgery.'),
  ('MS - Ophthalmology', 'Postgraduate', 'Ophthalmology', 'Master of Surgery in Eye and Ophthalmic Surgery.'),
  ('MS - ENT (Otorhinolaryngology)', 'Postgraduate', 'ENT', 'Master of Surgery in Ear, Nose, and Throat Surgery.'),
  ('MS - Obstetrics & Gynecology', 'Postgraduate', 'Obstetrics & Gynecology', 'Master of Surgery in Women Reproductive Health and Childbirth.'),
  ('MDS - Orthodontics', 'Postgraduate', 'Dental Specialties', 'Master of Dental Surgery in Tooth Alignment and Braces.'),
  ('MDS - Oral & Maxillofacial Surgery', 'Postgraduate', 'Dental Surgery', 'Master of Dental Surgery in Jaw and Facial Surgery.'),
  ('MDS - Conservative Dentistry & Endodontics', 'Postgraduate', 'Dentistry', 'Master of Dental Surgery in Root Canals and Restoration.'),
  ('MDS - Periodontology', 'Postgraduate', 'Dentistry', 'Master of Dental Surgery in Gum Diseases.'),
  ('DM - Cardiology', 'Super Specialization', 'Cardiology', 'Doctorate of Medicine in Adult and Pediatric Heart Diseases.'),
  ('DM - Neurology', 'Super Specialization', 'Neurology', 'Doctorate of Medicine in Brain and Nervous System Disorders.'),
  ('DM - Gastroenterology', 'Super Specialization', 'Gastroenterology', 'Doctorate of Medicine in Digestive and Liver Diseases.'),
  ('DM - Nephrology', 'Super Specialization', 'Nephrology', 'Doctorate of Medicine in Kidney Diseases and Dialysis.'),
  ('DM - Endocrinology', 'Super Specialization', 'Endocrinology', 'Doctorate of Medicine in Hormonal and Diabetic Disorders.'),
  ('DM - Medical Oncology', 'Super Specialization', 'Oncology', 'Doctorate of Medicine in Cancer Chemotherapy.'),
  ('MCh - Neurosurgery', 'Super Specialization', 'Neurosurgery', 'Master of Chirurgiae in Brain and Spine Surgery.'),
  ('MCh - Urology', 'Super Specialization', 'Urology', 'Master of Chirurgiae in Urinary Tract and Kidney Surgery.'),
  ('MCh - CTVS (Cardiothoracic Surgery)', 'Super Specialization', 'Cardiac Surgery', 'Master of Chirurgiae in Open Heart and Thoracic Surgery.'),
  ('MCh - Pediatric Surgery', 'Super Specialization', 'Pediatric Surgery', 'Master of Chirurgiae in Neonatal and Child Surgery.'),
  ('MCh - Plastic & Reconstructive Surgery', 'Super Specialization', 'Plastic Surgery', 'Master of Chirurgiae in Cosmetic and Reconstructive Surgery.'),
  ('DNB (Diplomate of National Board)', 'Postgraduate', 'Various Specialties', 'Postgraduate medical qualification equivalent to MD/MS.'),
  ('BPT / MPT (Physiotherapy)', 'Undergraduate / Master', 'Physiotherapy', 'Bachelor / Master in Physiotherapy and Physical Rehabilitation.'),
  ('Fellowship / Post-Doctoral Subspecialty', 'Fellowship', 'Subspecialty', 'Advanced clinical fellowship training in focused subspecialty.')
ON CONFLICT (degree_name) DO UPDATE SET 
  level = EXCLUDED.level,
  field_of_study = EXCLUDED.field_of_study,
  description = EXCLUDED.description;

NOTIFY pgrst, 'reload schema';
