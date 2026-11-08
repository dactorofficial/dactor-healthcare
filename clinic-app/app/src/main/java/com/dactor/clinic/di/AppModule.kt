package com.dactor.clinic.di

import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.createSupabaseClient
import io.github.jan.supabase.gotrue.Auth
import io.github.jan.supabase.functions.Functions
import io.github.jan.supabase.postgrest.Postgrest
import io.github.jan.supabase.realtime.Realtime
import io.github.jan.supabase.serializer.KotlinXSerializer
import io.github.jan.supabase.storage.Storage
import kotlinx.serialization.json.Json
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
object AppModule {

    @Volatile
    private var instance: SupabaseClient? = null

    @Provides
    @Singleton
    fun provideSupabaseClient(): SupabaseClient {
        return instance ?: synchronized(this) {
            instance ?: createSupabaseClient(
            supabaseUrl = "https://ojfoofojcpabqegxmsab.supabase.co",
            supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9qZm9vZm9qY3BhYnFlZ3htc2FiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAzNTM1MTgsImV4cCI6MjEwNTkyOTUxOH0.pH1yOGykaaQTzlQxeCvcQ78HQwxhTSi4yA8JmvT-Y9Y"
        ) {
            defaultSerializer = KotlinXSerializer(
                Json {
                    ignoreUnknownKeys = true
                    isLenient = true
                    coerceInputValues = true
                }
            )
            install(Auth)
            install(Functions)
            install(Postgrest)
            install(Storage)
            install(Realtime)
        }.also { instance = it }
        return@synchronized instance!!
        }
    }
}
