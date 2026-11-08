package com.dactor.clinic.data.local.entity

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "sync_metadata")
data class SyncMetadataEntity(
    @PrimaryKey
    @ColumnInfo(name = "table_name")
    val tableName: String,

    @ColumnInfo(name = "last_sync_timestamp")
    val lastSyncTimestamp: Long = 0L,

    @ColumnInfo(name = "last_sync_status")
    val lastSyncStatus: String = "SUCCESS",

    @ColumnInfo(name = "last_error")
    val lastError: String? = null
)
