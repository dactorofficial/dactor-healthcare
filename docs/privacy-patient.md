# Dactor Patient & Guardian Privacy Policy

**Effective Date:** October 23, 2026  
**Last Updated:** October 23, 2026  
**Applicability:** Dactor Patient Android App (`com.dactor.patient`), Dactor Patient Web Portal (`https://dactorofficial.github.io/dactor/`), Online OPD Queue Tracker, Diagnostic Lab Report Center, and Patient Health Scheduling Services.  
**Jurisdiction:** Nepal (Nepal Individual Privacy Act 2075, Privacy Rules 2077, Electronic Transactions Act 2063, Consumer Protection Act 2075) & Google Play Store Health Apps Policy.

---

## 1. Introduction & Our Sacred Medical Privacy Pledge

Welcome to **Dactor** ("Dactor", "we", "us", or "our"), Nepal's dedicated outpatient (OPD) queue tracking, clinic discovery, and diagnostic laboratory tracking platform.

At Dactor, **your medical and personal privacy is sacred**. We believe you should have complete clarity and control over how your information is handled. We designed our platform with strict "Privacy-by-Design" principles: we collect only what is strictly necessary to schedule your doctor consultations, track your real-time waiting tokens, deliver your certified lab reports securely, and eliminate physical queues in hospital waiting rooms.

If you represent a clinic, hospital, diagnostic lab, or medical practitioner seeking our provider policy, please refer to our [Dactor Clinic & Healthcare Provider Privacy Policy](privacy-clinic.md) (Live: [https://dactorofficial.github.io/privacy-clinic.html](https://dactorofficial.github.io/privacy-clinic.html)).

---

## 2. Personal Information We Collect from Patients

We collect information directly from you when you register an account, book an OPD appointment, search for healthcare facilities, track live queue positions, or access diagnostic reports:

### 2.1 Personal Identity & Contact Data
- **Basic Profile:** Full legal name, mobile telephone number, email address (optional for login/notifications), age, and biological gender.
- **Google Sign-In Account Data (Optional):** When authenticating via Google Sign-In, we collect your basic profile details (full name, email address, and profile photo URL) provided by Google LLC strictly for authentication and account profile setup. We never access your contacts, files, or unauthorized Google services.
- **Why We Need It:** Your name and mobile number ensure the attending clinic identifies you correctly on their OPD roster and allows you to retrieve booking confirmations and certified lab reports.

### 2.2 Appointment & Queue Scheduling Data
- **Booking Details:** Attending doctor chosen, clinic or polyclinic visited, medical specialty (e.g., Cardiology, Pediatrics, Ophthalmology, Orthopedics, General OPD), scheduled date and time slot, consultation type (First Visit or Follow-up Consultation).
- **10-Digit Tracking Code & Token:** A unique 10-digit alphanumeric booking reference (e.g., `DAC-9821-47`) and consecutive token number issued for each appointment session.
- **Live Queue Interaction:** Real-time queue position, estimated waiting time minutes, and arrival status.

### 2.3 Diagnostic Pathology & Imaging Records
- **Lab Test Requisitions:** Diagnostic tests booked (e.g., Blood Sugar, CBC, Thyroid Profile, Lipid Profile, Digital X-Ray, Ultrasound/USG, MRI, CT Scan).
- **Lab Statuses & Reports:** 3-stage progress tracking: (1) Sample Collected, (2) Processing in Lab, and (3) Prepared & Uploaded.
- **Encrypted Pathology Reports:** Certified lab report documents (PDFs or medical images) generated and uploaded by authorized clinical laboratories for your confidential download.

### 2.4 Device & Communication Information
- **Push Notification Token (FCM):** Google Firebase Cloud Messaging token associated with your device to transmit high-priority alerts when your turn is approaching or your lab report is ready.
- **Device Model & OS:** Operating system version and crash diagnostic logs to maintain application stability across Android devices.

### 2.5 Foreground Location Data (Strictly Optional & Foreground-Only)
- **OpenStreetMap Clinic Search:** With your permission, the app checks your current foreground location coordinates to calculate physical distance and show clinics nearest to you on an interactive OpenStreetMap.
- **NEVER Background Tracked:** Dactor **never** tracks or accesses your location in the background. If you prefer not to share GPS, you can manually type your city (e.g., Kathmandu, Pokhara, Janakpur, Biratnagar, Chitwan) or browse the map directly without any loss of functionality.

---

## 3. How We Use Your Information

We process patient personal information strictly for genuine healthcare coordination:

1. **Issuing OPD Tokens & Smart Arrival Windows:** Calculating real-time wait times and displaying accurate arrival windows (e.g., "Arrive around 3:20 PM" or "3:15 – 3:30 PM") so you do not waste hours in crowded waiting halls.
2. **High-Priority Queue Notifications:** Sending instant push notifications:
   - When your appointment is confirmed;
   - When you are "2 patients away" from entering the doctor's cabin;
   - When the doctor has called your token number;
   - When a verified diagnostic test report has been uploaded and is ready for download.
3. **Confidential Lab Report Name Verification Gate:** Requiring verification of the registered patient's full name before unlocking private pathology report downloads.
4. **Electronic Payment & Invoicing:** Generating digital receipts compliant with Nepal Rastra Bank (NRB) digital payment bylaws and Nepal tax regulations.
5. **Customer Support:** Resolving booking inquiries, schedule changes, or payment disputes via our Helpdesk ticketing system.

---

## 4. Privacy by Design: Public Queue Masking & Confidentiality

We recognize that waiting room display screens and public queue boards can inadvertently expose personal health details if not safeguarded. Dactor incorporates **PII Masking by Design**:

- **Masked Public Displays:** When viewing live queue boards publicly or on clinic lobby TV screens, patient names and telephone numbers are automatically obscured (e.g., `Ra*** Sh****` and `980****123`).
- **No Diagnostic Exposure on Queues:** Public queue displays never display the medical reason for consultation, symptoms, or diagnostic findings. Bystanders can only see anonymous token numbers and masked initials.
- **10-Digit Code Security:** Only the patient holding the specific 10-digit private booking code or logged into the verified patient account can see unmasked consultation specifics.

---

## 5. Diagnostic Laboratory Confidentiality & Identity Verification Gate

Medical test results contain highly sensitive personal health data. To prevent unauthorized access:

1. **3-Stage Verified Pipeline:** Pathology samples are tracked step-by-step from collection to processing to upload by certified technicians.
2. **Confidential Name Verification Gate:** To view, open, or download a certified lab report, the user must input the exact registered patient's full name matching the laboratory requisition slip.
3. **Expiring Cryptographic Signed URLs:** Lab PDF reports are stored in encrypted private cloud storage buckets. Access links expire within minutes and cannot be publicly scraped, indexed, or shared with third parties.

---

## 6. Patient Controls & Opt-In Early Arrival Offers

You maintain full control over your scheduling preferences:

- **Standard Fixed Slots:** By default, every patient retains their reserved appointment slot. We will never advance your consultation time without your explicit consent.
- **"Allow Early Call" Opt-In Feature:** When booking, you can optionally check *"Allow Early Call"*. If your doctor finishes consultations ahead of schedule, the clinic may dispatch a push alert offering you an earlier turn. If you cannot make it early, your original reserved slot remains fully protected without penalty.

---

## 7. Medical Disclaimer & Emergency Notice (Dial 102)

> **CRITICAL MEDICAL DISCLAIMER:**  
> Dactor is an outpatient (OPD) queue scheduling, doctor discovery, and lab report delivery platform. **Dactor is NOT an emergency medical service and does not provide automated clinical diagnosis or emergency triage.**  
> If you or someone you are booking for is experiencing acute chest pain, difficulty breathing, major trauma, profuse bleeding, or any life-threatening emergency, **immediately call Nepal Ambulance Service by dialing 102** or proceed directly to the nearest hospital Emergency Room (ER) / Casualty Department.

---

## 8. Third-Party Integrations & Absolute "Zero Data Selling" Policy

**Dactor will NEVER sell, lease, monetize, or trade your personal or health data.** We reject advertising-funded health data monetization. We do not partner with data brokers, pharmaceutical sales teams, or ad networks.

We partner only with essential technology providers to deliver our core services:
- **Cloud Infrastructure (Supabase / PostgreSQL):** Encrypted database storage with Row-Level Security (RLS) guaranteeing data isolation.
- **Push Notifications (Firebase Cloud Messaging - Google LLC):** Delivering encrypted mobile alerts for appointment status changes.
- **Digital Payment Gateways (eSewa & Nepal Digital Wallets):** Processing online consultation fees in compliance with Nepal Rastra Bank guidelines. Dactor never captures or stores your bank credentials, ATM PIN, or wallet password.
- **Mapping (OpenStreetMap & MapLibre):** Displaying open-source community maps without third-party behavioral profiling.

---

## 9. Data Security & Cryptographic Protection

We protect your personal health information using multi-layered security controls:
- **TLS 1.3 Transport Encryption:** All data transmitted between your device and our servers is protected by modern TLS 1.3 cryptographic protocols.
- **Storage Encryption:** Patient databases and diagnostic documents are encrypted at rest using industry-standard AES-256 encryption.
- **Multi-Tenant Row-Level Security (RLS):** Database access is enforced at the database engine level, ensuring only you and your attending clinic can access your health entries.

---

## 10. Patient Rights, Data Erasure & Google Play Account Deletion

Under Nepal's Individual Privacy Act 2075 and Google Play Developer Policies, you possess full ownership and rights over your personal data:

### 10.1 Right to Access and Correction
You have the right to inspect your profile data, past consultation records, and downloaded laboratory reports at any time via the Patient Portal. You may update your contact information directly in your profile settings.

### 10.2 Right to Account Deletion (Self-Service)
You can permanently delete your Dactor account at any time directly through the Patient App:
- Navigate to **Profile → Account Safety → Delete Account**.
- Alternatively, submit an account deletion request via our support portal: [https://dactorofficial.github.io/support](https://dactorofficial.github.io/support).

### 10.3 30-Day Deletion Grace Period
When you initiate account deletion:
1. Your account is immediately deactivated and disconnected from future booking or marketing interactions.
2. A 30-day security grace period ensures you can recover your health records if the request was made by mistake.
3. After 30 days, all personal identifying records, device tokens, and session credentials are permanently purged from our active systems.

---

## 11. Children & Minors' Privacy

Dactor takes children's privacy seriously. Minors under 18 years of age may utilize Dactor services only with the consent and supervision of a parent or legal guardian. Parents and guardians may book OPD pediatric consultations or diagnostic tests on behalf of their children through their guardian account.

---

## 12. Nepal Legal Compliance & Regulatory Framework

Dactor operates under the legal framework of Nepal:
- **Individual Privacy Act 2075 (2018):** Full adherence to privacy principles, lawful consent, sensitive personal data confidentiality, and data subject rights.
- **Privacy Rules 2077 (2020):** Procedures for data protection, processing limitations, and security measures.
- **Electronic Transactions Act 2063 (2008):** Legal recognition of digital health tokens, electronic booking confirmations, and digital receipts.
- **Consumer Protection Act 2075 (2018):** Transparent consultation fees in NPR without hidden surcharges.

---

## 13. Data Protection Officer & Grievance Redressal

If you have any questions, concerns, complaints, or wish to exercise your data privacy rights, please reach out to our dedicated Data Protection Officer:

- **Organization:** Dactor Nepal Digital Healthcare Platform
- **Data Protection Officer:** Dactor Privacy & Regulatory Team
- **Direct Privacy Email:** [dactorofficial@gmail.com](mailto:dactorofficial@gmail.com)
- **Online Helpdesk & Ticket Portal:** [https://dactorofficial.github.io/support](https://dactorofficial.github.io/support)
- **Operational Office:** Janakpur Dham, Dhanusha, Madhesh Province, Nepal
- **Response Commitment:** All privacy and data erasure inquiries receive a formal acknowledgment within 24–48 hours.

---

*© 2026 Dactor Health. All rights reserved. Document version: v1.0.26.*
