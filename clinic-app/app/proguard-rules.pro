# Dactor Production Proguard / R8 Optimization Rules

# Kotlin & Coroutines
-keepclassmembers class kotlinx.coroutines.** {
    volatile <fields>;
}

# Kotlin Serialization
-keepattributes *Annotation*,InnerClasses,Signature
-keepclassmembers class * {
    @kotlinx.serialization.Serializable <fields>;
    @kotlinx.serialization.SerialName <fields>;
}
-keepclassmembers class **$companion {
    public kotlinx.serialization.KSerializer serializer();
}

# Supabase & Ktor / Retrofit Networking
-keep class io.github.jan.supabase.** { *; }
-keep interface io.github.jan.supabase.** { *; }
-keep class io.ktor.** { *; }

# Android Jetpack Compose
-keep class androidx.compose.** { *; }
-dontwarn androidx.compose.**

# Firebase Cloud Messaging
-keep class com.google.firebase.** { *; }
-dontwarn com.google.firebase.**

# Room Database / SQLite
-keep class * extends androidx.room.RoomDatabase
-dontwarn androidx.room.paging.**
