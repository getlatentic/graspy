plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.kapt")
    id("org.jetbrains.kotlin.plugin.compose")
    id("org.jetbrains.kotlin.plugin.serialization")
    id("com.google.gms.google-services")
}

/** Release signing comes from a Gradle property or the environment, never from a file in the repository. */
fun releaseSetting(name: String): String? =
    providers.gradleProperty(name).orElse(providers.environmentVariable(name)).orNull?.takeIf { it.isNotBlank() }

val releaseStoreFile = releaseSetting("GRASPY_RELEASE_STORE_FILE")?.let(::file)
val releaseKeyAlias = releaseSetting("GRASPY_RELEASE_KEY_ALIAS")
val releaseStorePassword = releaseSetting("GRASPY_RELEASE_STORE_PASSWORD")
val releaseSigningMissing = listOfNotNull(
    "GRASPY_RELEASE_STORE_FILE".takeIf { releaseStoreFile?.isFile != true },
    "GRASPY_RELEASE_KEY_ALIAS".takeIf { releaseKeyAlias == null },
    "GRASPY_RELEASE_STORE_PASSWORD".takeIf { releaseStorePassword == null },
)
val releasePackaging = setOf("packageRelease", "packageReleaseBundle", "signReleaseBundle")

kapt {
    correctErrorTypes = true
    arguments {
        arg("room.schemaLocation", "$projectDir/schemas")
    }
}

android {
    namespace = "com.latentic.graspy"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.latentic.graspy"
        minSdk = 26
        targetSdk = 36
        versionCode = 1
        versionName = "0.1.0"
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        val apiBaseUrl = providers.gradleProperty("GRASPY_API_BASE_URL")
            .orElse("https://graspy-api.getlatentic.com/")
            .get()
        buildConfigField("String", "API_BASE_URL", "\"$apiBaseUrl\"")
    }

    signingConfigs {
        if (releaseSigningMissing.isEmpty()) {
            create("release") {
                storeFile = releaseStoreFile
                storePassword = releaseStorePassword
                keyAlias = releaseKeyAlias
                // A PKCS12 keystore has one password, for the store and its key.
                keyPassword = releaseSetting("GRASPY_RELEASE_KEY_PASSWORD") ?: releaseStorePassword
            }
        }
    }

    buildTypes {
        debug {
            // host:port of Firebase's Auth emulator, for signing in without a Google account (README.md).
            val authEmulator = providers.gradleProperty("GRASPY_AUTH_EMULATOR").orElse("").get()
            buildConfigField("String", "AUTH_EMULATOR", "\"$authEmulator\"")
        }
        release {
            signingConfig = signingConfigs.findByName("release")
            buildConfigField("String", "AUTH_EMULATOR", "\"\"")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    buildFeatures {
        compose = true
        buildConfig = true
    }
}

// A release is signed with graspy's release key or not built at all: never unsigned, never debug-signed.
gradle.taskGraph.whenReady {
    val packagesRelease = allTasks.any { it.project == project && it.name in releasePackaging }
    if (packagesRelease && releaseSigningMissing.isNotEmpty()) {
        throw GradleException(
            "A release build needs graspy's release key. Not set, or naming no file: " +
                "${releaseSigningMissing.joinToString()}. Run scripts/release.sh, which reads the password " +
                "from the Keychain, or set them as Gradle properties or environment variables (README.md).",
        )
    }
}

kotlin {
    compilerOptions {
        jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17)
    }
}

dependencies {
    val composeBom = platform("androidx.compose:compose-bom:2025.08.01")
    implementation(composeBom)
    implementation(platform("com.google.firebase:firebase-bom:34.17.0"))
    implementation("com.google.firebase:firebase-auth")
    implementation("androidx.credentials:credentials:1.6.0")
    implementation("androidx.credentials:credentials-play-services-auth:1.6.0")
    implementation("com.google.android.libraries.identity.googleid:googleid:1.2.0")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-play-services:1.10.2")
    implementation("androidx.activity:activity-compose:1.10.1")
    implementation("androidx.compose.foundation:foundation")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.material:material-icons-extended")
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-tooling-preview")
    implementation("androidx.lifecycle:lifecycle-runtime-compose:2.10.0")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.10.0")
    implementation("androidx.room:room-ktx:2.8.4")
    implementation("androidx.room:room-runtime:2.8.4")
    implementation("androidx.work:work-runtime-ktx:2.11.2")
    implementation("androidx.webkit:webkit:1.17.1")
    implementation("com.squareup.retrofit2:retrofit:3.0.0")
    implementation("com.squareup.retrofit2:converter-kotlinx-serialization:3.0.0")
    implementation("com.squareup.okhttp3:okhttp:5.3.0")
    implementation("com.google.android.gms:play-services-cronet:18.1.1")
    implementation("com.google.net.cronet:cronet-okhttp:0.1.1")
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.7.3")
    kapt("androidx.room:room-compiler:2.8.4")
    debugImplementation("androidx.compose.ui:ui-tooling")
    testImplementation("junit:junit:4.13.2")
    testImplementation("com.squareup.okhttp3:mockwebserver:5.3.0")
    testImplementation("org.robolectric:robolectric:4.17")
}
