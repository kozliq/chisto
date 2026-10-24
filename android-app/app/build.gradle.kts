import java.io.File

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// Адрес сервера берём из того же .env, что и сервер.
val env: Map<String, String> = File(rootDir, "../.env").takeIf { it.exists() }?.readLines()
    ?.mapNotNull { line -> line.trim().takeIf { it.isNotEmpty() && !it.startsWith("#") && "=" in it } }
    ?.associate { it.substringBefore("=").trim() to it.substringAfter("=").trim() }
    ?: emptyMap()
fun envOr(key: String, def: String) = env[key]?.takeIf { it.isNotBlank() } ?: def

android {
    namespace = "com.example.chisto"
    compileSdk = 35

    defaultConfig {
        applicationId = envOr("PROFILE_ID", "com.example.chisto")
        minSdk = 26
        targetSdk = 35
        versionCode = 1
        versionName = "0.1.0"
        buildConfigField("String", "DOH_HOST", "\"${envOr("DOH_HOST", "dns.example.com")}\"")
        buildConfigField("String", "DOH_PATH", "\"${envOr("DOH_PATH", "/dns-query")}\"")
        buildConfigField("String", "SITE_URL", "\"https://${envOr("DOH_HOST", "dns.example.com")}/\"")
    }

    buildFeatures { buildConfig = true }

    buildTypes {
        release {
            isMinifyEnabled = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"))
            // Подпись релиза — своим ключом владельца, ключ в репозиторий не кладём.
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }

    // Локальный список: те же доменные правила, что уходят в DNS сервера (filters/build/dns.txt).
    sourceSets["main"].assets.srcDir(layout.buildDirectory.dir("generated/blocklist"))
}

val copyBlocklist by tasks.registering(Copy::class) {
    from(File(rootDir, "../filters/build/dns.txt"))
    into(layout.buildDirectory.dir("generated/blocklist"))
}
tasks.named("preBuild") { dependsOn(copyBlocklist) }
