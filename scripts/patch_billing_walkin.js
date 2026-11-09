const fs = require('fs');

// 1. Update BillingScreen.kt
{
    const filePath = 'clinic-app/app/src/main/java/com/dactor/clinic/ui/billing/BillingScreen.kt';
    let text = fs.readFileSync(filePath, 'utf8');
    const isCrlf = text.includes('\r\n');
    const eol = isCrlf ? '\r\n' : '\n';

    // Add helper function before BillingScreen composable
    const helperFunc = [
        'private fun checkIsFollowUp(appt: Appointment, allAppts: List<Appointment>): Boolean {',
        '    if ((appt.feeAmount ?: 0.0) == 0.0) return true',
        '    val docId = appt.doctorId ?: return false',
        '    val pKey = PaymentLedgerHelper.derivePatientKey(appt.userId, appt.patientMobile, appt.patientName, appt.id)',
        '    val earliest = allAppts',
        '        .filter { !it.status.equals("cancelled", ignoreCase = true) && !it.status.equals("rejected", ignoreCase = true) && it.doctorId == docId }',
        '        .sortedWith(compareBy({ it.appointmentDate }, { it.appointmentTime }, { it.id }))',
        '        .firstOrNull { PaymentLedgerHelper.derivePatientKey(it.userId, it.patientMobile, it.patientName, it.id) == pKey }',
        '    return earliest != null && earliest.id != appt.id',
        '}',
        ''
    ].join(eol);

    if (!text.includes('private fun checkIsFollowUp')) {
        text = text.replace('@OptIn(ExperimentalMaterial3Api::class)\r\n@Composable\r\nfun BillingScreen(', 
            helperFunc + '@OptIn(ExperimentalMaterial3Api::class)\r\n@Composable\r\nfun BillingScreen(');
        text = text.replace('@OptIn(ExperimentalMaterial3Api::class)\n@Composable\nfun BillingScreen(', 
            helperFunc + '@OptIn(ExperimentalMaterial3Api::class)\n@Composable\nfun BillingScreen(');
    }

    // Update selectAppointment
    const oldSelectAppt = [
        '        if (billingRepository != null) {',
        '            val opdFee = appt.feeAmount ?: 0.0',
        '            val existingInv = billingRepository.getInvoiceByAppointment(appt.id)',
        '            if (existingInv != null) {',
        '                val cleanItems = existingInv.items.filterNot { it.itemName.startsWith("Payment Received", ignoreCase = true) }',
        '                val mapped = cleanItems.map {',
        '                    val uPrice = if (it.price > 0.0) it.price else if (it.total > 0.0 && it.quantity > 0) it.total / it.quantity else 0.0',
        '                    InvoiceLineItem(name = it.itemName, unitPrice = uPrice, quantity = it.quantity)',
        '                }',
        '                lineItems = if (mapped.isNotEmpty()) {',
        '                    mapped',
        '                } else if (opdFee > 0.0) {',
        '                    listOf(InvoiceLineItem(name = "OPD Doctor Consultation", unitPrice = opdFee, quantity = 1))',
        '                } else if (existingInv.totalAmount > 0.0) {',
        '                    listOf(InvoiceLineItem(name = "OPD Consultation & Clinical Services", unitPrice = existingInv.totalAmount, quantity = 1))',
        '                } else {',
        '                    emptyList()',
        '                }',
        '                paymentRecords = PaymentLedgerHelper.parsePaymentRecords(',
        '                    rawRemarks = existingInv.remarks,',
        '                    fallbackPaidAmount = existingInv.effectivePaidAmount,',
        '                    fallbackDate = existingInv.paidAt',
        '                )',
        '                clinicalRemarks = PaymentLedgerHelper.extractCleanClinicalRemarks(existingInv.remarks)',
        '                newPaymentAmountInput = ""',
        '                newPaymentNote = ""',
        '            } else {',
        '                lineItems = if (opdFee > 0.0) {',
        '                    listOf(InvoiceLineItem(name = "OPD Doctor Consultation", unitPrice = opdFee, quantity = 1))',
        '                } else {',
        '                    emptyList()',
        '                }',
        '                val existingApptFee = opdFee',
        '                if (appt.paymentStatus.equals("paid", ignoreCase = true) && existingApptFee > 0.0) {',
        '                    paymentRecords = listOf(',
        '                        PaymentRecord(',
        '                            amount = existingApptFee,',
        '                            dateTime = "${appt.appointmentDate} ${appt.appointmentTime ?: "10:00 AM"}",',
        '                            note = "OPD Consultation Fee"',
        '                        )',
        '                    )',
        '                } else {',
        '                    paymentRecords = emptyList()',
        '                }',
        '                clinicalRemarks = ""',
        '                newPaymentAmountInput = ""',
        '                newPaymentNote = ""',
        '            }',
        '        }'
    ].join(eol);

    const newSelectAppt = [
        '        if (billingRepository != null) {',
        '            val isFollowUp = checkIsFollowUp(appt, clinicAppointments)',
        '            val opdFee = if (isFollowUp) 0.0 else (appt.feeAmount ?: 0.0)',
        '            val existingInv = billingRepository.getInvoiceByAppointment(appt.id)',
        '            if (existingInv != null) {',
        '                val cleanItems = existingInv.items.filterNot { it.itemName.startsWith("Payment Received", ignoreCase = true) }',
        '                val mapped = cleanItems.map {',
        '                    val uPrice = if (it.price > 0.0) it.price else if (it.total > 0.0 && it.quantity > 0) it.total / it.quantity else 0.0',
        '                    InvoiceLineItem(name = it.itemName, unitPrice = uPrice, quantity = it.quantity)',
        '                }',
        '                lineItems = if (mapped.isNotEmpty()) {',
        '                    mapped',
        '                } else if (!isFollowUp && opdFee > 0.0) {',
        '                    listOf(InvoiceLineItem(name = "OPD Doctor Consultation", unitPrice = opdFee, quantity = 1))',
        '                } else if (!isFollowUp && existingInv.totalAmount > 0.0) {',
        '                    listOf(InvoiceLineItem(name = "OPD Consultation & Clinical Services", unitPrice = existingInv.totalAmount, quantity = 1))',
        '                } else {',
        '                    emptyList()',
        '                }',
        '                paymentRecords = PaymentLedgerHelper.parsePaymentRecords(',
        '                    rawRemarks = existingInv.remarks,',
        '                    fallbackPaidAmount = existingInv.effectivePaidAmount,',
        '                    fallbackDate = existingInv.paidAt',
        '                )',
        '                clinicalRemarks = PaymentLedgerHelper.extractCleanClinicalRemarks(existingInv.remarks)',
        '                newPaymentAmountInput = ""',
        '                newPaymentNote = ""',
        '            } else {',
        '                lineItems = if (!isFollowUp && opdFee > 0.0) {',
        '                    listOf(InvoiceLineItem(name = "OPD Doctor Consultation", unitPrice = opdFee, quantity = 1))',
        '                } else {',
        '                    emptyList()',
        '                }',
        '                val existingApptFee = opdFee',
        '                if (!isFollowUp && appt.paymentStatus.equals("paid", ignoreCase = true) && existingApptFee > 0.0) {',
        '                    paymentRecords = listOf(',
        '                        PaymentRecord(',
        '                            amount = existingApptFee,',
        '                            dateTime = "${appt.appointmentDate} ${appt.appointmentTime ?: "10:00 AM"}",',
        '                            note = "OPD Consultation Fee"',
        '                        )',
        '                    )',
        '                } else {',
        '                    paymentRecords = emptyList()',
        '                }',
        '                clinicalRemarks = ""',
        '                newPaymentAmountInput = ""',
        '                newPaymentNote = ""',
        '            }',
        '        }'
    ].join(eol);

    if (text.includes(oldSelectAppt)) {
        text = text.replace(oldSelectAppt, newSelectAppt);
    } else {
        console.warn('oldSelectAppt not found!');
    }

    // Update itemsToSave when saving
    const oldItemsToSave = [
        '                            val itemsToSave = if (baseItems.isNotEmpty()) {',
        '                                baseItems',
        '                            } else if (opdFee > 0.0) {',
        '                                listOf(InvoiceItem(itemName = "OPD Doctor Consultation", quantity = 1, price = opdFee, total = opdFee))',
        '                            } else {',
        '                                emptyList()',
        '                            }'
    ].join(eol);

    const newItemsToSave = [
        '                            val isSavingFollowUp = checkIsFollowUp(finalAppt, clinicAppointments)',
        '                            val itemsToSave = if (baseItems.isNotEmpty()) {',
        '                                baseItems',
        '                            } else if (!isSavingFollowUp && opdFee > 0.0) {',
        '                                listOf(InvoiceItem(itemName = "OPD Doctor Consultation", quantity = 1, price = opdFee, total = opdFee))',
        '                            } else {',
        '                                emptyList()',
        '                            }'
    ].join(eol);

    if (text.includes(oldItemsToSave)) {
        text = text.replace(oldItemsToSave, newItemsToSave);
    } else {
        console.warn('oldItemsToSave not found!');
    }

    fs.writeFileSync(filePath, text, 'utf8');
    console.log('BillingScreen.kt updated successfully!');
}

// 2. Update WalkinBookingScreen.kt
{
    const filePath = 'clinic-app/app/src/main/java/com/dactor/clinic/ui/walkin/WalkinBookingScreen.kt';
    let text = fs.readFileSync(filePath, 'utf8');
    const isCrlf = text.includes('\r\n');
    const eol = isCrlf ? '\r\n' : '\n';

    // Add isFollowUpVisit state
    const targetState = '    var feeAmount by remember { mutableStateOf("500") }';
    const replacementState = '    var feeAmount by remember { mutableStateOf("500") }\n    var isFollowUpVisit by remember { mutableStateOf(false) }';

    if (text.includes(targetState) && !text.includes('var isFollowUpVisit')) {
        text = text.replace(targetState, replacementState);
    }

    // Add visit type chips after doctor list
    const doctorListEnd = [
        '                        FilterChip(',
        '                            selected = isSelected,',
        '                            onClick = { selectedDoctor = doc },',
        '                            label = { Text("Dr. ${doc.fullName} (${doc.specialty})", fontSize = 12.sp) }',
        '                        )',
        '                    }',
        '                }',
        '            }'
    ].join(eol);

    const doctorListEndWithVisitType = [
        '                        FilterChip(',
        '                            selected = isSelected,',
        '                            onClick = { selectedDoctor = doc },',
        '                            label = { Text("Dr. ${doc.fullName} (${doc.specialty})", fontSize = 12.sp) }',
        '                        )',
        '                    }',
        '                }',
        '            }',
        '',
        '            // Visit Type: New Consultation vs Free Follow-up',
        '            if (!isLabClinic) {',
        '                Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {',
        '                    Text("Visit Type *", fontWeight = FontWeight.Bold, fontSize = 13.sp, color = MaterialTheme.colorScheme.onSurface)',
        '                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {',
        '                        val docFee = (selectedDoctor?.consultationFee ?: 500.0).toInt()',
        '                        FilterChip(',
        '                            selected = !isFollowUpVisit,',
        '                            onClick = { isFollowUpVisit = false },',
        '                            label = { Text("New Visit (Rs. $docFee)", fontSize = 12.sp) }',
        '                        )',
        '                        FilterChip(',
        '                            selected = isFollowUpVisit,',
        '                            onClick = { isFollowUpVisit = true },',
        '                            label = { Text("Follow-up (Free / Rs. 0)", fontSize = 12.sp) }',
        '                        )',
        '                    }',
        '                }',
        '            }'
    ].join(eol);

    if (text.includes(doctorListEnd)) {
        text = text.replace(doctorListEnd, doctorListEndWithVisitType);
    }

    // Update computedFee
    const oldComputedFee = [
        '                            val computedFee = if (isLabClinic) {',
        '                                selectedLabTests.sumOf { it.price }',
        '                            } else {',
        '                                feeAmount.toDoubleOrNull() ?: 500.0',
        '                            }'
    ].join(eol);

    const newComputedFee = [
        '                            val computedFee = if (isLabClinic) {',
        '                                selectedLabTests.sumOf { it.price }',
        '                            } else if (isFollowUpVisit) {',
        '                                0.0',
        '                            } else {',
        '                                selectedDoctor?.consultationFee ?: (feeAmount.toDoubleOrNull() ?: 500.0)',
        '                            }'
    ].join(eol);

    if (text.includes(oldComputedFee)) {
        text = text.replace(oldComputedFee, newComputedFee);
    }

    fs.writeFileSync(filePath, text, 'utf8');
    console.log('WalkinBookingScreen.kt updated successfully!');
}
