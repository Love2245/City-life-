import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("rust")
}

val tauriProperties = Properties().apply {
    val propFile = file("tauri.properties")
    if (propFile.exists()) {
        propFile.inputStream().use { load(it) }
    }
}

// TapTap values are supplied at build time. Never commit Client Token or
// server-side credentials to this generated Android project.
val tapClientId = providers.gradleProperty("taptapClientId")
    .orElse(providers.environmentVariable("TAPTAP_CLIENT_ID"))
    .getOrElse("")
val tapClientToken = providers.gradleProperty("taptapClientToken")
    .orElse(providers.environmentVariable("TAPTAP_CLIENT_TOKEN"))
    .getOrElse("")
val tapEnhanced = providers.gradleProperty("taptapEnhanced")
    .orElse(providers.environmentVariable("TAPTAP_ENHANCED"))
    .orElse("false")
    .get()
    .toBoolean()
fun buildConfigString(value: String) = "\"${value.replace("\\", "\\\\").replace("\"", "\\\"")}\""

if (tapEnhanced && (tapClientId.isBlank() || tapClientToken.isBlank())) {
    throw GradleException("Enhanced TapTap APK requires TAPTAP_CLIENT_ID and TAPTAP_CLIENT_TOKEN at build time.")
}

android {
    compileSdk = 36
    namespace = "com.urbanlife.game"
    defaultConfig {
        manifestPlaceholders["usesCleartextTraffic"] = "false"
        applicationId = "com.urbanlife.game"
        minSdk = 24
        targetSdk = 36
        versionCode = tauriProperties.getProperty("tauri.android.versionCode", "1").toInt()
        versionName = tauriProperties.getProperty("tauri.android.versionName", "1.0")
        buildConfigField("boolean", "TAPTAP_ENHANCED", tapEnhanced.toString())
        buildConfigField("String", "TAPTAP_CLIENT_ID", buildConfigString(tapClientId))
        buildConfigField("String", "TAPTAP_CLIENT_TOKEN", buildConfigString(tapClientToken))
    }
    buildTypes {
        getByName("debug") {
            manifestPlaceholders["usesCleartextTraffic"] = "true"
            isDebuggable = true
            isJniDebuggable = true
            isMinifyEnabled = false
            packaging {                jniLibs.keepDebugSymbols.add("*/arm64-v8a/*.so")
                jniLibs.keepDebugSymbols.add("*/armeabi-v7a/*.so")
                jniLibs.keepDebugSymbols.add("*/x86/*.so")
                jniLibs.keepDebugSymbols.add("*/x86_64/*.so")
            }
        }
        getByName("release") {
            isMinifyEnabled = true
            proguardFiles(
                *fileTree(".") { include("**/*.pro") }
                    .plus(getDefaultProguardFile("proguard-android-optimize.txt"))
                    .toList().toTypedArray()
            )
        }
    }
    kotlinOptions {
        jvmTarget = "1.8"
    }
    buildFeatures {
        buildConfig = true
    }
}

rust {
    rootDirRel = "../../../"
}

dependencies {
    implementation("androidx.webkit:webkit:1.14.0")
    implementation("androidx.appcompat:appcompat:1.7.1")
    implementation("androidx.activity:activity-ktx:1.10.1")
    implementation("com.google.android.material:material:1.12.0")
    implementation("androidx.lifecycle:lifecycle-process:2.10.0")
    implementation("com.taptap.sdk:tap-core:4.10.9")
    implementation("com.taptap.sdk:tap-login:4.10.9")
    implementation("com.taptap.sdk:tap-compliance:4.10.9")
    implementation("com.taptap.sdk:tap-cloudsave:4.10.9")
    testImplementation("junit:junit:4.13.2")
    androidTestImplementation("androidx.test.ext:junit:1.1.4")
    androidTestImplementation("androidx.test.espresso:espresso-core:3.5.0")
}

apply(from = "tauri.build.gradle.kts")
