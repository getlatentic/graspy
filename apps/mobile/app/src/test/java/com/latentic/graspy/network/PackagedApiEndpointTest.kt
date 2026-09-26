package com.latentic.graspy.network

import com.latentic.graspy.BuildConfig
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class PackagedApiEndpointTest {
    @Test
    fun `ordinary debug build targets the shared graspy API`() {
        assertEquals("https://graspy-api.getlatentic.com/", BuildConfig.API_BASE_URL)
        assertTrue(BuildConfig.API_BASE_URL.startsWith("https://"))
    }
}
