# Dactor Clinic & Healthcare Provider Privacy Policy

**Effective Date:** October 23, 2026  
**Last Updated:** October 23, 2026  
**Applicability:** Dactor Clinic Android App (`com.dactor.clinic`), Dactor Clinic Web Portal, Doctor Consultation Desk, Laboratory Management Portal, and Healthcare Administrative Services.  
**Jurisdiction:** Nepal (Nepal Individual Privacy Act 2075, Privacy Rules 2077, Electronic Transactions Act 2063, Nepal Medical Council Act 2020) & Google Play Store Developer & Health Apps Policies.

---

## 1. Introduction & Scope

Welcome to **Dactor** ("Dactor", "we", "us", or "our"), an administrative outpatient department (OPD) queue intelligence, appointment scheduling, and diagnostic laboratory orchestration platform operated in Nepal.

This **Clinic & Healthcare Provider Privacy Policy** governs the collection, processing, storage, and protection of personal and institutional information provided by:
- Healthcare facilities (clinics, polyclinics, hospitals, diagnostic pathology centers, and imaging facilities);
- Medical practitioners and consulting doctors registered with the Nepal Medical Council (NMC);
- Clinic administrators, reception desk operators, laboratory technicians, and authorized staff members.

Dactor provides administrative software infrastructure that connects clinics and doctors with patients. In this ecosystem, **the healthcare facility operates as an independent Data Controller / Fiduciary** with respect to the medical records of its patients, while **Dactor operates as a secure Data Processor / Technology Infrastructure Provider**.

If you are a patient or guardian seeking the Patient Privacy Policy, please refer to our [Dactor Patient & Guardian Privacy Policy](privacy-patient.md) (Live: [https://dactorofficial.github.io/privacy-patient.html](https://dactorofficial.github.io/privacy-patient.html)).

---

## 2. Information We Collect from Clinics & Healthcare Providers

To register, verify, and operate healthcare facilities and attending practitioners on Dactor, we collect the following categories of data:

### 2.1 Clinic & Facility Institutional Information
- **Facility Profile:** Clinic/hospital registered name, physical address, GPS coordinates (latitude and longitude) for patient discovery on OpenStreetMap, municipality, ward number, and province.
- **Regulatory & Tax Identification:** Government registration certificate number, Permanent Account Number (PAN) or Value Added Tax (VAT) certificate, and health facility operational license issued by the Ministry of Health and Population (MoHP) or local authority.
- **Contact Credentials:** Primary clinic mobile number, administrative email address, authorized contact person name, and official facility phone number.
- **Facility Assets:** Clinic logos, exterior and interior consultation facility photographs for patient orientation.

### 2.2 Medical Practitioner & Doctor Credentials (KYC Verification)
- **Practitioner Identity:** Full legal name, professional title, profile photograph, medical specialty, qualifications (e.g., MBBS, MD, MS, DM, MCh, BDS), and languages spoken.
- **Nepal Medical Council (NMC) Registration:** Official NMC permanent or temporary registration number and registration certificate copy. Dactor mandates valid NMC licensure for all doctors conducting consultations.
- **Consultation Parameters:** Room/cabin assignment, physical presence status, consulting schedule, appointment time slot intervals, and consultation fees denominated in Nepalese Rupees (NPR).

### 2.3 Staff & Authorized Device Credentials
- **Staff Accounts:** Receptionist, billing clerk, and laboratory technician usernames, email addresses, and encrypted authentication tokens.
- **Google Sign-In Account Data (Optional):** Clinic administrators and medical staff choosing Google Sign-In provide their Google account name, email address, and profile photo URL strictly for single sign-on authentication and profile display.
- **Device & Prefix Management:** Assigned device identifiers and registration prefix codes to manage concurrency, prevent unauthorized multi-device access, and log administrative audit actions.

### 2.4 Diagnostic Laboratory Catalog & Requisition Records
- **Lab Test Master Catalog:** Names of pathology and radiology tests offered (e.g., CBC, Lipid Profile, LFT, KFT, Digital X-Ray, USG, CT, MRI), test turnaround expectations, fasting requirements, and transparent NPR rates.
- **Diagnostic Uploads:** Scanned laboratory reports, certified pathology documents, and imaging reports uploaded in PDF or image format for patient delivery.

---

## 3. Patient Information Handled by Clinics via Dactor

While using Dactor, clinics and practitioners handle confidential patient data. Dactor provides encrypted tools for managing these workflows:

1. **OPD Queue & Token Records:** Assigned 10-digit tracking codes, queue token numbers, scheduled consultation time windows, and patient status (`waiting`, `in_consultation`, `completed`, `cancelled`, `no_show`).
2. **Consultation & Clinical Notes:** Optional attending doctor clinical summaries, diagnosis notes, follow-up recommendations, and digital prescriptions entered into the consultation desk.
3. **Walk-In Registrations:** When clinic reception staff register walk-in patients directly at the desk, the staff inputs the patient's name, mobile number, age, gender, and doctor choice with patient verbal consent.
4. **Diagnostic Requisitions & Statuses:** 3-stage laboratory pipeline tracking: (1) Sample Collected, (2) Processing in Lab, and (3) Prepared & Uploaded.
5. **Billing Invoices & Ledgers:** Itemized consultation charges, lab investigation fees, discount records, payment gateway receipts (eSewa / fonepay / cash at desk), and invoice timestamps.

---

## 4. Purpose of Data Processing & Operational Workflows

Dactor processes provider and associated patient data strictly for legitimate healthcare administrative and technical operations:

- **OPD Queue Coordination:** Synchronizing live token calling, displaying estimated arrival windows, and minimizing physical crowding in clinic waiting rooms.
- **Doctor Physical Presence Indicator:** Accurately reflecting whether an attending doctor is physically "In Cabin" or "Away" so patients are truthfully informed.
- **Early Arrival Notifications:** Providing an opt-in workflow where clinic staff can send high-priority push notifications to patients who explicitly agreed to early calls when a doctor is ahead of schedule.
- **3-Stage Lab Delivery:** Enabling certified lab technicians to upload verified pathology reports and ensuring delivery to the correct patient via identity verification gates.
- **Billing & Legal Receipts:** Generating electronic payment receipts and tracking revenue settlements in accordance with Nepal financial and tax regulations.
- **Fraud Prevention & Audit Trails:** Logging critical actions (such as token cancellations, refund authorizations, and diagnostic report uploads) to maintain institutional accountability.

---

## 5. Doctor-Patient Confidentiality & Nepal Legal Compliance

Healthcare providers using Dactor agree to adhere to the strictest standards of patient confidentiality:

### 5.1 Nepal Individual Privacy Act 2075 (2018) & Privacy Rules 2077
Under Section 3 and Section 28 of the Individual Privacy Act 2075, **health data is classified as sensitive personal data**. Healthcare providers must maintain total confidentiality. Dactor enforces technical safeguards, but clinics and doctors bear the legal duty under Nepal law never to disclose patient information without explicit consent or judicial order.

### 5.2 Nepal Medical Council (NMC) Code of Ethics
Doctors utilizing Dactor must uphold the NMC Code of Medical Ethics (2017). Attending doctors are solely responsible for their clinical evaluations, diagnostic interpretations, and treatment plans. Dactor is a communication and management medium and does not engage in the practice of medicine.

### 5.3 Electronic Transactions Act 2063 (2008)
Digital appointment tokens, electronic invoices, and electronic signatures generated through Dactor hold legal validity as electronic records pursuant to Nepal's Electronic Transactions Act 2063.

---

## 6. Data Security, Storage & Architecture

We employ defense-in-depth security measures to protect healthcare information:

- **Encryption in Transit:** All communications between mobile applications, web portals, and server infrastructure are encrypted using modern Transport Layer Security (TLS 1.3).
- **Encryption at Rest:** All sensitive personal and institutional records stored in the cloud database are encrypted at rest with industry-standard cryptographic algorithms.
- **Row-Level Security (RLS):** Strict multi-tenant PostgreSQL Row-Level Security policies ensure that staff from Clinic A can never view, query, or leak records belonging to Clinic B.
- **Private Diagnostic Storage Buckets:** Uploaded medical documents (lab reports, scans) are stored in private, unguessable storage buckets protected by short-lived, time-limited cryptographic signed URLs. Public directory listing is strictly disabled.
- **Local SQLite Encrypted Ledger & Offline Sync:** The Clinic Android app utilizes an isolated local SQLite database for uninterrupted desk operations during network volatility, synchronizing back to the cloud ledger via atomic transactions.

---

## 7. Third-Party Integrations & Absolute "Zero Data Selling" Policy

**Dactor maintains an absolute Zero-Sale policy.** We do NOT sell, rent, monetize, broker, or trade personal data, practitioner credentials, or patient health information to third parties, advertisers, pharmaceutical marketing groups, or insurance aggregators.

We only integrate with authorized third-party infrastructure providers necessary to deliver platform functions:
- **Cloud Database & Storage (Supabase / AWS):** Isolated hosting with RLS policy enforcement.
- **Push Notification Infrastructure (Firebase Cloud Messaging - Google LLC):** Delivering instant priority queue token alerts and doctor-in-cabin updates to mobile devices.
- **Geographic Mapping (OpenStreetMap & MapLibre):** Displaying open-source geographic clinic pins without tracking user personal browsing habits.
- **Nepal Payment Processors (eSewa / Digital Wallets):** Processing licensed financial transactions under Nepal Rastra Bank (NRB) digital payment bylaws. No credit card or wallet PINs are ever stored by Dactor.

---

## 8. Android App Permissions & Google Play Developer Policy Compliance

The Dactor Clinic Android app (`com.dactor.clinic`) complies with Google Play Developer Program Policies, the Google Play Health Apps Policy, and User Data Guidelines:

| Permission | Technical Requirement & Justification |
| :--- | :--- |
| `POST_NOTIFICATIONS` | High-priority alerting for incoming appointment bookings, patient cancellations, and emergency desk notices. |
| `CAMERA` | Capturing official clinic documents, doctor NMC license certificates during KYC verification, and paper pathology requisitions. |
| `READ_MEDIA_IMAGES` / `READ_EXTERNAL_STORAGE` | Uploading verified PDF lab reports, doctor profile avatars, and facility photos. |
| `ACCESS_FINE_LOCATION` / `ACCESS_COARSE_LOCATION` | Used strictly in foreground upon explicit user tap to autofill clinic branch coordinates on the map. Never tracked in background. |
| `FOREGROUND_SERVICE` | Used for active background billing generation and offline queue synchronization while desk staff perform transactions. |

---

## 9. Data Retention, Account Deletion & Right to Erasure

### 9.1 Account Deletion Compliance
In compliance with Google Play Store User Data Policies, clinic administrators and medical practitioners can request complete deletion of their account and associated profiles directly within the app settings or via our support desk.

### 9.2 30-Day Account Deletion Grace Period
When an account deletion request is initiated:
1. The facility or doctor profile is immediately deactivated and removed from public search and booking directories.
2. A 30-day security grace period is applied, during which the administrator may cancel the request if initiated inadvertently.
3. Upon expiry of 30 days, all staff authentication credentials, tokens, and active sessions are permanently erased from our production servers.

### 9.3 Medical-Legal Record Preservation
In accordance with Nepal health regulations and statutory audit requirements, certain finalized billing records and diagnostic test audit logs may be retained in encrypted, non-active archives for the legally mandated statutory period before permanent destruction.

---

## 10. Grievance Officer, Contact Information & Dispute Resolution

If you have questions, regulatory inquiries, or wish to exercise data rights regarding this Clinic Privacy Policy, please contact our designated Data Protection & Regulatory Officer:

- **Entity:** Dactor Nepal Digital Healthcare Platform
- **Designated Privacy Officer:** Dactor Legal & Compliance Team
- **Official Privacy Email:** [dactorofficial@gmail.com](mailto:dactorofficial@gmail.com)
- **Technical Support Portal:** [https://dactorofficial.github.io/support](https://dactorofficial.github.io/support)
- **Operational Office:** Janakpur Dham, Dhanusha, Madhesh Province, Nepal
- **Governing Law & Jurisdiction:** Laws of Nepal; disputes subject to the exclusive jurisdiction of the competent courts of Nepal.

---

*© 2026 Dactor Health. All rights reserved. Document version: v1.0.26.*
