package com.dactor.patient.ui.booking

import android.annotation.SuppressLint
import android.content.ActivityNotFoundException
import android.content.Intent
import android.graphics.Bitmap
import android.net.Uri
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.viewinterop.AndroidView
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties

/**
 * Payment checkout inside the app (no external browser).
 *
 * Loads the server-built checkout page (eSewa / Khalti / Fonepay / ConnectIPS). When the server
 * finishes the payment flow it redirects to `dactor://payment-result?...`; that is caught here, the
 * screen closes and [onFinished] runs (the caller then asks the server for the real status — the page
 * result itself is never trusted). Links to the gateway's or a bank's own app (`intent://`, `esewa://`,
 * …) are handed to Android so the patient can approve there and come back.
 */
@OptIn(ExperimentalMaterial3Api::class)
@SuppressLint("SetJavaScriptEnabled")
@Composable
fun InAppPaymentDialog(
    checkoutUrl: String,
    title: String,
    onFinished: (status: String?) -> Unit,
    onClose: () -> Unit
) {
    var progress by remember { mutableStateOf(0) }
    var webView by remember { mutableStateOf<WebView?>(null) }
    var finished by remember { mutableStateOf(false) }

    fun finish(status: String?) {
        if (finished) return
        finished = true
        onFinished(status)
    }

    Dialog(
        onDismissRequest = onClose,
        properties = DialogProperties(usePlatformDefaultWidth = false, dismissOnClickOutside = false)
    ) {
        BackHandler {
            val wv = webView
            if (wv != null && wv.canGoBack()) wv.goBack() else onClose()
        }
        Surface(modifier = Modifier.fillMaxSize()) {
            Column(modifier = Modifier.fillMaxSize()) {
                TopAppBar(
                    navigationIcon = {
                        IconButton(onClick = onClose) { Icon(Icons.Default.Close, contentDescription = "Close payment") }
                    },
                    title = { Text(title, fontWeight = FontWeight.SemiBold) },
                    actions = { Icon(Icons.Default.Lock, contentDescription = "Secure connection") }
                )
                if (progress in 1..99) {
                    LinearProgressIndicator(progress = { progress / 100f }, modifier = Modifier.fillMaxWidth())
                }
                Box(modifier = Modifier.fillMaxSize()) {
                    AndroidView(
                        modifier = Modifier.fillMaxSize(),
                        factory = { context ->
                            WebView(context).apply {
                                settings.javaScriptEnabled = true
                                settings.domStorageEnabled = true
                                settings.allowFileAccess = false
                                settings.allowContentAccess = false
                                settings.mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
                                settings.setSupportMultipleWindows(false)
                                webChromeClient = object : android.webkit.WebChromeClient() {
                                    override fun onProgressChanged(view: WebView?, newProgress: Int) {
                                        progress = newProgress
                                    }
                                }
                                webViewClient = object : WebViewClient() {
                                    override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean =
                                        handleUrl(view, request.url)

                                    override fun onPageStarted(view: WebView, url: String?, favicon: Bitmap?) {
                                        // Some devices report the final redirect only here
                                        val uri = url?.let(Uri::parse) ?: return
                                        if (uri.scheme.equals("dactor", ignoreCase = true)) {
                                            view.stopLoading()
                                            handleUrl(view, uri)
                                        }
                                    }

                                    private fun handleUrl(view: WebView, uri: Uri): Boolean {
                                        val scheme = uri.scheme?.lowercase()
                                        return when {
                                            scheme == "https" || scheme == "http" -> false
                                            scheme == "dactor" && uri.host.equals("payment-result", ignoreCase = true) -> {
                                                finish(uri.getQueryParameter("status"))
                                                true
                                            }
                                            scheme == "intent" -> {
                                                try {
                                                    val intent = Intent.parseUri(uri.toString(), Intent.URI_INTENT_SCHEME)
                                                    // Only open browsable activities; never an explicit component chosen by the page
                                                    intent.addCategory(Intent.CATEGORY_BROWSABLE)
                                                    intent.component = null
                                                    intent.selector = null
                                                    try {
                                                        view.context.startActivity(intent)
                                                    } catch (_: ActivityNotFoundException) {
                                                        intent.getStringExtra("browser_fallback_url")
                                                            ?.takeIf { it.startsWith("https://") }
                                                            ?.let { view.loadUrl(it) }
                                                    }
                                                } catch (_: Exception) {}
                                                true
                                            }
                                            else -> {
                                                // Gateway / bank app links (esewa://, khalti://, upi://, market://)
                                                try {
                                                    view.context.startActivity(
                                                        Intent(Intent.ACTION_VIEW, uri).addCategory(Intent.CATEGORY_BROWSABLE)
                                                    )
                                                } catch (_: Exception) {}
                                                true
                                            }
                                        }
                                    }
                                }
                                loadUrl(checkoutUrl)
                                webView = this
                            }
                        },
                        onRelease = { it.stopLoading(); it.destroy() }
                    )
                }
            }
        }
    }
}
