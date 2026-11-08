package com.dactor.clinic.data.local.dao

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import com.dactor.clinic.data.local.entity.SyncMetadataEntity

@Dao
interface SyncMetadataDao {

    @Query("SELECT * FROM sync_metadata WHERE table_name = :tableName LIMIT 1")
    suspend fun getMetadata(tableName: String): SyncMetadataEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertMetadata(metadata: SyncMetadataEntity)
}
