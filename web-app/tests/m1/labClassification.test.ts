import assert from 'node:assert/strict'
import { isDiagnosticLabClinic } from '../../src/utils/paymentLedger'

console.log('Running labClassification unit tests...')

// 1. Multi-visit clinic with Pathology & Radiology in specialties must NOT be classified as standalone diagnostic lab
const nobelMultiVisit = {
  id: '7ba2423a-740e-477c-9ffc-2a9316abbb04',
  name: 'NOBEL HEALTHCARE',
  type: 'multi_visit',
  specialties: [
    'General Medicine & Physician',
    'Orthopedics & Joint Care',
    'Pathology & Diagnostic Lab',
    'Radiology & Imaging',
  ],
}

const opdDoctor = {
  id: 'doc-1',
  fullName: 'Dr ankit jha',
  specialty: 'Orthopedics & Joint Care',
}

const opdAppt = {
  id: 'appt-1',
  clinicId: nobelMultiVisit.id,
  doctorId: opdDoctor.id,
  checkinStatus: 'waiting',
  selectedLabTests: null,
}

assert.equal(
  isDiagnosticLabClinic(nobelMultiVisit),
  false,
  'multi_visit clinic with Pathology specialty must NOT be classified as diagnostic lab'
)

assert.equal(
  isDiagnosticLabClinic(nobelMultiVisit, opdDoctor, opdAppt),
  false,
  'OPD doctor appointment at multi_visit clinic must NOT be classified as diagnostic lab'
)

// 2. Single-visit clinic with Pathology in specialties & completed status must NOT be classified as diagnostic lab
const singleVisitClinic = {
  id: '2c4604a6-ce88-4e23-875a-ba130d206fd5',
  name: 'Gunja Life Care Clinic',
  type: 'single_visit',
  specialties: ['Cardiology (Heart Care)', 'Pathology & Diagnostic Lab'],
}

assert.equal(
  isDiagnosticLabClinic(singleVisitClinic, opdDoctor, { checkinStatus: 'completed' }),
  false,
  'Completed OPD appointment at single_visit clinic must NOT be classified as diagnostic lab'
)

// 3. Explicit lab test booking inside a multi_visit clinic SHOULD still be treated as lab order
assert.equal(
  isDiagnosticLabClinic(nobelMultiVisit, null, {
    id: 'appt-lab-1',
    selectedLabTests: 'Complete Blood Count (CBC) (Rs. 450)',
  }),
  true,
  'Explicit selectedLabTests inside a multi_visit clinic should still route to diagnostic lab workflow'
)

// 4. Standalone diagnostic_lab clinic MUST be classified as diagnostic lab
const standaloneLab = {
  id: 'b5ea381f-b55e-46c8-b555-ade3e2818d07',
  name: 'hehe clinic',
  type: 'diagnostic_lab',
  specialties: ['Ophthalmology (Eye Care)'],
}

assert.equal(
  isDiagnosticLabClinic(standaloneLab),
  true,
  'diagnostic_lab clinic must always be classified as diagnostic lab'
)

console.log('All labClassification unit tests passed!')
