# Google Play Console — App Content & Policy Declarations

Use these answers when completing the **App Content** questionnaires in Google Play Console:

---

### 1. Privacy Policy
- **Patient App**: `https://dactorofficial.github.io/dactor/privacy-patient.html`
- **Clinic App**: `https://dactorofficial.github.io/dactor/privacy-clinic.html`

---

### 2. Ads Declaration
- **Does your app contain ads?**
  - Select: **No, my app does not contain ads.**
  *(Dactor has zero third-party advertising banners, interstitials, or video ads).*

---

### 3. App Access (Reviewer Credentials)
Google Play review requires access credentials to test all features:
- **For Dactor Patient App:**
  - Select: **All or some functionality is restricted.**
  - Instruction Name: `Demo Patient Account`
  - Username / Phone: `+977 9800000001` (or test phone number)
  - OTP / Password: Use fixed test OTP (e.g. `123456`) or Guest Mode / Live Queue search without login.
  - Notes for Reviewer: *Patients can browse verified clinics, search specialties, view live queue tokens, and view interactive maps without creating an account (Guest Mode). Account login is required only to book appointments and view personal lab reports.*

- **For Dactor Clinic App:**
  - Select: **All or some functionality is restricted.**
  - Instruction Name: `Demo Clinic Staff Account`
  - Clinic Code / Email / Password: Provide test credentials for test clinic.

---

### 4. Content Rating (IARC)
- **Category:** Health / Medical / Utility
- **Does the app contain violence, blood, or gore?** -> **No**
- **Does the app contain sexual content or nudity?** -> **No**
- **Does the app contain profanity or offensive language?** -> **No**
- **Does the app simulate gambling?** -> **No**
- **Does the app share user location?** -> **Yes** (Foreground location solely to discover nearby clinics and calculate travel distance)
- **Does the app allow digital purchase?** -> **Yes** (Consultation fee pre-booking)

---

### 5. Target Audience and Content
- **Target Age Group:** Select **18 and over**.
- **Could your store listing appeal to children?** -> Select **No**.

---

### 6. News App Declaration
- **Is your app a news app?** -> **No**

---

### 7. COVID-19 Contact Tracing & Status Apps
- **Is your app a contact tracing or status app?** -> **No**

---

### 8. Government Apps
- **Is your app developed by or on behalf of a government?** -> **No**
  *(Dactor is an independent digital health innovation platform in Nepal).*

---

### 9. Financial Features
- **Does your app provide financial features?** -> **Yes**
- Feature type: **Payment processing / Billing invoicing for medical consultation services.**
- Regulated partners: Integrated with licensed Payment Service Providers in Nepal (eSewa / Fonepay). No banking credentials or credit card PANs are collected or retained by Dactor.

---

### 10. Health Apps Policy Declaration
- **Category:** **Healthcare Services & Management**
- Checkboxes to select:
  - ✔ **Appointment scheduling and queue management**
  - ✔ **Laboratory test result delivery (viewing certified reports)**
  - ✔ **Electronic medical records & counter billing administration**
- Declaration: *Dactor does NOT provide medical diagnostic decision algorithms or clinical triage advice. It is an administrative operational workflow platform for OPD queue transparency.*
