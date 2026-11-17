package com.dactor.clinic.data.local.entity

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey
import com.dactor.clinic.data.model.Profile

@Entity(
    tableName = "patients",
    indices = [
        Index(value = ["clinic_id"]),
        Index(value = ["phone"]),
        Index(value = ["tracking_code_10_digit"]),
        Index(value = ["full_name"])
    ]
)
data class PatientEntity(
    @PrimaryKey
    @ColumnInfo(name = "id")
    val id: String,

    @ColumnInfo(name = "clinic_id")
    val clinicId: String,

    @ColumnInfo(name = "full_name")
    val fullName: String,

    @ColumnInfo(name = "phone")
    val phone: String? = null,

    @ColumnInfo(name = "gender")
    val gender: String? = "Male",

    @ColumnInfo(name = "age")
    val age: Int? = null,

    @ColumnInfo(name = "email")
    val email: String? = null,

    @ColumnInfo(name = "tracking_code_10_digit")
    val trackingCode10Digit: String? = null,

    @ColumnInfo(name = "last_visit_date")
    val lastVisitDate: String? = null,

    @ColumnInfo(name = "last_doctor_id")
    val lastDoctorId: String? = null,

    @ColumnInfo(name = "last_doctor_name")
    val lastDoctorName: String? = null,

    @ColumnInfo(name = "total_visits")
    val totalVisits: Int = 1,

    @ColumnInfo(name = "latest_bill_status")
    val latestBillStatus: String? = null,

    @ColumnInfo(name = "latest_clinical_remarks")
    val latestClinicalRemarks: String? = null,

    @ColumnInfo(name = "sync_status")
    val syncStatus: String = "synced",

    @ColumnInfo(name = "updated_at")
    val updatedAt: Long = System.currentTimeMillis()
) {
    fun toProfile(): Profile {
        return Profile(
            id = id,
            authUid = null,
            email = email ?: "",
            fullName = fullName,
            role = "patient",
            phone = phone,
            gender = gender ?: "Male",
            age = age
        )
    }
}
