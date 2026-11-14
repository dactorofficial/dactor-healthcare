import { Clinic, Doctor } from '../types'
import { resolveStorageUrl } from '../services/db'

/**
 * Dactor Dynamic SEO & Schema.org Structured Data Injector
 * 
 * Supports:
 * - Google Rich Results & Knowledge Graph (MedicalClinic, Physician)
 * - Google Reserve / Appointment Booking Actions (schema.org/ReserveAction)
 * - Generative Engine Optimization (GEO) for AI search engines (ChatGPT, Perplexity, Gemini, Claude)
 * - OpenGraph (Facebook, WhatsApp, LinkedIn) and Twitter Card metadata
 */

export function getBaseUrl(): string {
  if (typeof window !== 'undefined' && window.location) {
    const origin = window.location.origin
    const path = window.location.pathname.replace(/\/$/, '')
    return `${origin}${path}`
  }
  return 'https://dactorofficial.github.io/dactor'
}

const SCRIPT_ID = 'dactor-dynamic-schema-ldjson'

export function updatePageSEO(options: {
  title?: string
  description?: string
  canonicalUrl?: string
  ogImage?: string
  robots?: string
  clinic?: Clinic | null
  doctor?: Doctor | null
  allDoctors?: Doctor[]
}) {
  if (typeof document === 'undefined') return

  const baseUrl = getBaseUrl()
  const { title, description, canonicalUrl, ogImage, robots, clinic, doctor, allDoctors } = options

  // 1. Update Title Tag
  if (title) {
    document.title = title
    updateMetaTag('title', title)
    updateMetaProperty('og:title', title)
    updateMetaProperty('twitter:title', title)
  }

  // 2. Update Description Tag
  if (description) {
    updateMetaTag('description', description)
    updateMetaProperty('og:description', description)
    updateMetaProperty('twitter:description', description)
  }

  // 3. Update Robots Meta Tag
  if (robots) {
    updateMetaTag('robots', robots)
  } else {
    updateMetaTag('robots', 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1')
  }

  // 4. Update Canonical & OpenGraph URL dynamically matching current host
  const activeUrl = canonicalUrl || (clinic ? `${baseUrl}/?clinic=${clinic.id}` : baseUrl)
  updateMetaProperty('og:url', activeUrl)
  updateMetaProperty('twitter:url', activeUrl)

  let linkCanonical = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null
  if (!linkCanonical) {
    linkCanonical = document.createElement('link')
    linkCanonical.rel = 'canonical'
    document.head.appendChild(linkCanonical)
  }
  linkCanonical.href = activeUrl

  // 5. Update OpenGraph Image
  const clinicImage = clinic?.pictures?.[0] || clinic?.logoUrl
  const resolvedClinicImage = clinicImage ? (resolveStorageUrl(clinicImage, 'clinic_photos') || clinicImage) : undefined
  const imageUrl = ogImage || resolvedClinicImage || `${baseUrl}/app_logo.svg`
  updateMetaProperty('og:image', imageUrl)
  updateMetaProperty('twitter:image', imageUrl)

  // 6. Inject / Update Schema.org JSON-LD Structured Data
  if (clinic) {
    injectClinicJsonLd(clinic, doctor, allDoctors)
  } else {
    resetDefaultJsonLd()
  }
}

/**
 * Sets standard SEO metadata for predefined routes across Dactor
 */
export function setDefaultTabSEO(tab: string, extra?: { query?: string; code?: string; clinicName?: string }) {
  const baseUrl = getBaseUrl()
  switch (tab) {
    case 'home':
      updatePageSEO({
        title: "Dactor - Nepal's Realtime Healthcare OPD Queue, Clinic Portal & Lab Ecosystem",
        description: "Book doctor appointments online in Nepal, track live OPD clinic token queues in real-time, find specialist doctors, order pathology lab tests (MRI, CT, Blood), and download verified medical reports on Dactor.",
        canonicalUrl: `${baseUrl}/`
      })
      break
    case 'clinics': {
      const q = extra?.query
      const title = q
        ? `${q} Doctors & Clinics in Nepal | Dactor Booking`
        : "Find Verified Doctors & Clinics in Nepal | Dactor"
      const description = q
        ? `Search top rated ${q} specialist doctors and verified clinics in Kathmandu and across Nepal. Book instant OPD appointments and view consultation fees.`
        : "Browse verified polyclinics, hospitals, diagnostic pathology centers, and specialist doctors across Kathmandu, Lalitpur, and Nepal."
      updatePageSEO({
        title,
        description,
        canonicalUrl: q ? `${baseUrl}/?tab=clinics&q=${encodeURIComponent(q)}` : `${baseUrl}/?tab=clinics`
      })
      break
    }
    case 'live-queue': {
      const code = extra?.code
      updatePageSEO({
        title: code
          ? `Live OPD Queue Status for Token #${code} | Dactor`
          : "Live OPD Queue Tracker & Consultation Wait Time | Dactor Nepal",
        description: "Monitor live hospital and clinic consulting token numbers in real time, current patient in cabin, and estimated wait minutes with your 10-digit tracking code.",
        canonicalUrl: code ? `${baseUrl}/?tab=live-queue&code=${code}` : `${baseUrl}/?tab=live-queue`
      })
      break
    }
    case 'lab-reports':
      updatePageSEO({
        title: "Download Certified Diagnostic Lab Reports Online | Dactor Nepal",
        description: "Track your pathology blood test, urine culture, ultrasound, and digital imaging reports online in 3 stages and download verified PDF medical records securely.",
        canonicalUrl: `${baseUrl}/?tab=lab-reports`
      })
      break
    case 'average-time':
      updatePageSEO({
        title: "Live OPD Wait Times & Consultation Telemetry | Dactor Nepal",
        description: "Real-time doctor consultation durations, patient queue counts, and waiting times across verified medical clinics in Nepal.",
        canonicalUrl: `${baseUrl}/?tab=average-time`
      })
      break
    case 'support':
      updatePageSEO({
        title: "24/7 Patient & Clinic Helpdesk Support | Dactor Nepal",
        description: "Need help booking an appointment, tracking live OPD queues, or accessing lab results? Submit a support ticket or track existing requests.",
        canonicalUrl: `${baseUrl}/?page=support`
      })
      break
    case 'portal':
    case 'doctor-portal':
    case 'patient-portal':
    case 'account':
    case 'records':
      updatePageSEO({
        title: tab === 'portal' ? 'Clinic Management Portal | Dactor' : tab === 'doctor-portal' ? 'Doctor Clinical Portal | Dactor' : 'Patient Health Portal | Dactor',
        description: 'Secure healthcare portal on Dactor.',
        robots: 'noindex, nofollow'
      })
      break
    case '404':
      updatePageSEO({
        title: 'Page Not Found (404) | Dactor Health',
        description: 'The requested healthcare page could not be found.',
        robots: 'noindex, nofollow'
      })
      break
    default:
      break
  }
}

function updateMetaTag(name: string, content: string) {
  let tag = document.querySelector(`meta[name="${name}"]`) as HTMLMetaElement | null
  if (!tag) {
    tag = document.createElement('meta')
    tag.name = name
    document.head.appendChild(tag)
  }
  tag.content = content
}

function updateMetaProperty(property: string, content: string) {
  let tag = document.querySelector(`meta[property="${property}"]`) as HTMLMetaElement | null
  if (!tag) {
    tag = document.createElement('meta')
    tag.setAttribute('property', property)
    document.head.appendChild(tag)
  }
  tag.content = content
}

/**
 * Builds Schema.org JSON-LD with ReserveAction so Google Search surfaces
 * a "Book Online" / "Make an Appointment" rich action leading directly to Dactor.
 */
function injectClinicJsonLd(clinic: Clinic, selectedDoctor?: Doctor | null, doctors: Doctor[] = []) {
  const baseUrl = getBaseUrl()
  const isLab = clinic.type === 'diagnostic_lab' || clinic.name.toLowerCase().includes('lab')
  const clinicUrl = `${baseUrl}/?clinic=${clinic.id}`
  const bookUrl = `${baseUrl}/?clinic=${clinic.id}&action=book`

  // Available services for the clinic/lab
  const availableServices: any[] = []
  if (isLab) {
    const labTestNames = [
      'Magnetic Resonance Imaging (MRI Scan)',
      'Computed Tomography (CT Scan)',
      'Digital X-Ray & Radiography',
      'Ultrasonography (USG / Ultrasound)',
      'Complete Blood Count (CBC) & Pathology Panel',
      'Biochemistry, Lipid & Liver Function Tests (LFT)',
      'Kidney Function Tests (KFT) & Urine Analysis',
      'Thyroid Profile (T3, T4, TSH)'
    ]
    for (const testName of labTestNames) {
      availableServices.push({
        '@type': 'MedicalTest',
        name: testName,
        provider: {
          '@type': 'DiagnosticLab',
          name: clinic.name,
        },
      })
    }
  } else {
    availableServices.push({
      '@type': 'MedicalProcedure',
      name: 'General & Specialist OPD Consultation',
      provider: {
        '@type': 'MedicalClinic',
        name: clinic.name,
      },
    })
    if (clinic.specialties && clinic.specialties.length > 0) {
      for (const sp of clinic.specialties) {
        availableServices.push({
          '@type': 'MedicalProcedure',
          name: `${sp} Consultation & Examination`,
          provider: {
            '@type': 'MedicalClinic',
            name: clinic.name,
          },
        })
      }
    }
  }

  // Base Schema for the Clinic / Diagnostic Center
  const clinicSchema: any = {
    '@context': 'https://schema.org',
    '@type': isLab
      ? ['DiagnosticLab', 'MedicalClinic', 'MedicalBusiness', 'LocalBusiness']
      : ['MedicalClinic', 'MedicalBusiness', 'LocalBusiness'],
    '@id': `${clinicUrl}#clinic`,
    name: clinic.name,
    legalName: clinic.name,
    description:
      clinic.description ||
      `${clinic.name} - Online OPD doctor appointment booking, real-time live token queue tracking, and certified diagnostic reports in Nepal.`,
    url: clinicUrl,
    telephone: clinic.contactPhone || undefined,
    email: clinic.contactEmail || undefined,
    image: clinic.pictures && clinic.pictures.length > 0 ? clinic.pictures : `${baseUrl}/app_logo.svg`,
    address: {
      '@type': 'PostalAddress',
      streetAddress: clinic.addressText || 'Nepal',
      addressLocality: clinic.city || 'Kathmandu',
      addressCountry: 'NP',
    },
    currenciesAccepted: 'NPR',
    paymentAccepted: 'Cash, eSewa, Khalti, Mobile Banking, Credit Card',
    priceRange: 'NPR 100 - 1500',
    isAcceptingNewPatients: true,
    availableService: availableServices,
    hasMap: clinic.latitude && clinic.longitude
      ? `https://www.google.com/maps/dir/?api=1&destination=${clinic.latitude},${clinic.longitude}`
      : `https://maps.google.com/?q=${encodeURIComponent(clinic.name + ' ' + (clinic.addressText || 'Nepal'))}`,
    // Google Reserve / Direct Appointment Booking Action
    potentialAction: {
      '@type': 'ReserveAction',
      name: `Book Appointment at ${clinic.name}`,
      target: {
        '@type': 'EntryPoint',
        urlTemplate: bookUrl,
        inLanguage: 'en',
        actionPlatform: [
          'http://schema.org/DesktopWebPlatform',
          'http://schema.org/MobileWebPlatform',
          'http://schema.org/AndroidPlatform',
        ],
      },
      result: {
        '@type': 'MedicalReservation',
        name: `OPD Appointment at ${clinic.name}`,
      },
    },
  }

  if (clinic.latitude && clinic.longitude) {
    clinicSchema.geo = {
      '@type': 'GeoCoordinates',
      latitude: clinic.latitude,
      longitude: clinic.longitude,
    }
  }

  if (clinic.specialties && clinic.specialties.length > 0) {
    clinicSchema.medicalSpecialty = clinic.specialties
  }

  // Add individual Physicians working at this clinic
  const physicianSchemas: any[] = []
  const docsToInclude = selectedDoctor ? [selectedDoctor] : doctors

  for (const doc of docsToInclude) {
    const docBookUrl = `${baseUrl}/?clinic=${clinic.id}&doctor=${doc.id}&action=book`
    const docDisplayName = doc.fullName.startsWith('Dr.') ? doc.fullName : `Dr. ${doc.fullName}`
    const docSpecialty = doc.specialty || 'General Physician'
    const feeNumber = doc.consultationFee || 500
    const feeText = `NPR ${feeNumber}`

    const docSchema: any = {
      '@context': 'https://schema.org',
      '@type': ['Physician', 'Person'],
      '@id': `${clinicUrl}#doctor-${doc.id}`,
      name: docDisplayName,
      honorificPrefix: 'Dr.',
      jobTitle: docSpecialty,
      medicalSpecialty: doc.specialties && doc.specialties.length > 0 ? doc.specialties : [docSpecialty],
      worksFor: {
        '@type': 'MedicalClinic',
        name: clinic.name,
        url: clinicUrl,
        telephone: clinic.contactPhone || undefined,
        address: clinicSchema.address,
      },
      telephone: clinic.contactPhone || undefined,
      email: doc.email || undefined,
      currenciesAccepted: 'NPR',
      priceRange: feeText,
      isAcceptingNewPatients: true,
      knowsLanguage: ['ne', 'en', 'hi'],
      availableService: {
        '@type': 'MedicalProcedure',
        name: `${docSpecialty} OPD Consultation`,
      },
      offers: {
        '@type': 'Offer',
        price: feeNumber,
        priceCurrency: 'NPR',
        availability: 'https://schema.org/InStock',
        validFrom: new Date().toISOString().split('T')[0],
      },
      potentialAction: {
        '@type': 'ReserveAction',
        name: `Book Consultation with ${docDisplayName}`,
        target: {
          '@type': 'EntryPoint',
          urlTemplate: docBookUrl,
          inLanguage: 'en',
          actionPlatform: [
            'http://schema.org/DesktopWebPlatform',
            'http://schema.org/MobileWebPlatform',
            'http://schema.org/AndroidPlatform',
          ],
        },
        result: {
          '@type': 'MedicalReservation',
          name: `Doctor Consultation with ${docDisplayName}`,
        },
      },
    }

    if (doc.nmcLicenseNumber) {
      docSchema.hasCredential = {
        '@type': 'EducationalOccupationalCredential',
        credentialCategory: 'MedicalLicense',
        name: `NMC Registration #${doc.nmcLicenseNumber}`,
        recognizedBy: {
          '@type': 'MedicalOrganization',
          name: 'Nepal Medical Council',
          url: 'https://nmc.org.np',
        },
      }
    }

    physicianSchemas.push(docSchema)
  }

  // BreadcrumbList for SERP navigation
  const breadcrumbList = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: 'Dactor Nepal',
        item: baseUrl,
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: clinic.city || 'Kathmandu',
        item: `${baseUrl}/?tab=clinics&city=${encodeURIComponent(clinic.city || 'Kathmandu')}`,
      },
      {
        '@type': 'ListItem',
        position: 3,
        name: clinic.name,
        item: clinicUrl,
      },
      ...(selectedDoctor
        ? [
            {
              '@type': 'ListItem',
              position: 4,
              name: selectedDoctor.fullName.startsWith('Dr.') ? selectedDoctor.fullName : `Dr. ${selectedDoctor.fullName}`,
              item: `${clinicUrl}&doctor=${selectedDoctor.id}`,
            },
          ]
        : []),
    ],
  }

  // Speakable specification for Voice Search & AI Overviews
  const speakableSchema = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    '@id': `${clinicUrl}#webpage`,
    name: selectedDoctor ? `Book Dr. ${selectedDoctor.fullName} at ${clinic.name}` : clinic.name,
    speakable: {
      '@type': 'SpeakableSpecification',
      cssSelector: ['h1', 'h2', '.clinic-overview-summary', '.doctor-bio-summary'],
    },
  }

  const fullGraph = {
    '@context': 'https://schema.org',
    '@graph': [clinicSchema, ...physicianSchemas, breadcrumbList, speakableSchema],
  }

  let scriptEl = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null
  if (!scriptEl) {
    scriptEl = document.createElement('script')
    scriptEl.id = SCRIPT_ID
    scriptEl.type = 'application/ld+json'
    document.head.appendChild(scriptEl)
  }
  scriptEl.textContent = JSON.stringify(fullGraph, null, 2)
}

function resetDefaultJsonLd() {
  const existing = document.getElementById(SCRIPT_ID)
  if (existing) {
    existing.remove()
  }
}
