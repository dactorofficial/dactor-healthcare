# Google Play Console — Data Safety Form Complete Answers

Fill out the **Data Safety** section in Google Play Console using the exact answers below:

---

## 1. Data Collection and Security
| Question | Answer |
| :--- | :--- |
| **Does your app collect or share any of the required user data types?** | **Yes** |
| **Is all of the user data collected by your app encrypted in transit?** | **Yes** (All network requests communicate via HTTPS / TLS 1.3) |
| **Do you provide a way for users to request that their data is deleted?** | **Yes** |
| **Add a link that users can use to request that their data is deleted:** | `https://dactorofficial.github.io/dactor/data-deletion.html` |

---

## 2. Data Types & Declarations

### 📍 Location
| Data Type | Collected? | Shared? | Purpose | Ephemeral? |
| :--- | :--- | :--- | :--- | :--- |
| **Approximate Location** | **Yes** | No | App functionality (Finding nearby clinics) | Yes |
| **Precise Location** | **Yes** | No | App functionality (Map distance and routing) | Yes |

*Note for Reviewers: Location is accessed exclusively in the foreground upon user interaction with the clinic discovery map. It is never tracked in the background.*

---

### 👤 Personal Info
| Data Type | Collected? | Shared? | Purpose |
| :--- | :--- | :--- | :--- |
| **Name** | **Yes** | No | App functionality, Account management, OPD appointment confirmation |
| **Email address** | **Yes** | No | Account management, Account recovery |
| **Phone number** | **Yes** | No | App functionality (SMS/OTP verification, live doctor queue call alerts) |

---

### 🩺 Health & Fitness
| Data Type | Collected? | Shared? | Purpose |
| :--- | :--- | :--- | :--- |
| **Health info** | **Yes** | No | App functionality (OPD consultation reasons, doctor specialty notes, certified diagnostic laboratory test delivery) |

*Declaration: Dactor does NOT share health data with third-party advertisers, data brokers, or pharmaceutical marketers. Health data is protected with Row-Level Security (RLS) and AES-256 storage encryption.*

---

### 💳 Financial Info
| Data Type | Collected? | Shared? | Purpose |
| :--- | :--- | :--- | :--- |
| **Purchase History / Transaction Info** | **Yes** | No | App functionality (Counter billing invoice records, eSewa appointment pre-booking reference) |

*Declaration: Dactor does NOT collect or store raw credit/debit card numbers or bank credentials. Digital payments are processed externally by regulated PSPs (eSewa / Fonepay).*

---

### 📱 Device or other IDs
| Data Type | Collected? | Shared? | Purpose |
| :--- | :--- | :--- | :--- |
| **Device or other IDs** | **Yes** | No | App functionality (Firebase Cloud Messaging push tokens for immediate doctor turn alerts) |

---

## 3. Privacy Policy URLs for Play Console
- **Patient App Policy URL**: `https://dactorofficial.github.io/dactor/privacy-patient.html`
- **Clinic App Policy URL**: `https://dactorofficial.github.io/dactor/privacy-clinic.html`
- **Data Deletion URL**: `https://dactorofficial.github.io/dactor/data-deletion.html`
