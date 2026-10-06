package app.nomadic.applybrowser;

import android.annotation.SuppressLint;
import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.graphics.Color;
import android.graphics.Typeface;
import android.net.Uri;
import android.text.TextUtils;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.CookieManager;
import android.webkit.GeolocationPermissions;
import android.webkit.PermissionRequest;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;
import androidx.activity.ComponentActivity;
import androidx.activity.OnBackPressedCallback;
import androidx.activity.result.ActivityResult;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.annotation.MainThread;
import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.webkit.JavaScriptReplyProxy;
import androidx.webkit.ScriptHandler;
import androidx.webkit.WebMessageCompat;
import androidx.webkit.WebSettingsCompat;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;
import java.util.Collections;
import java.util.HashMap;
import java.util.Map;
import java.util.Set;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * The apply WebView: a full-screen page over the app with a "Back to Nomadic" bar. The form
 * agent (a JS bundle from the app) is injected at document start into every frame, and each
 * frame gets a {@code nomadicBridge} object (androidx.webkit WebMessageListener) to talk to the
 * app. Requests are routed to frames by the agent's frame id; replies come back as raw JSON.
 *
 * Independent of Capacitor so it can be driven from instrumentation tests. Main thread only.
 */
public final class ApplyBrowserController {

    public interface Listener {
        /** An agent message (JSON string) from any frame. */
        void onMessage(String data);

        void onNavigation(String url, boolean loading);

        /** reason: "google_sign_in" or "external_link". */
        void onBlocked(String reason, String url);

        /** The candidate went back to the app (bar button, or back on the first page). */
        void onHidden();

        /** reason: "app" (close()) or "crashed" (renderer gone; the app keeps running). */
        void onClosed(String reason);
    }

    public static final String BRIDGE_NAME = "nomadicBridge";
    private static final Set<String> ALL_ORIGINS = Collections.singleton("*");
    /** Agent messages are small JSON; anything far bigger is not from the agent. */
    private static final int MAX_MESSAGE_CHARS = 4 * 1024 * 1024;

    private final ComponentActivity activity;
    private final Listener listener;
    private final ActivityResultLauncher<Intent> fileChooser;
    private final OnBackPressedCallback backCallback;
    /** Frame id (from the agent's hello) -> that frame's reply channel. */
    private final Map<String, JavaScriptReplyProxy> frames = new HashMap<>();

    @Nullable
    private FrameLayout overlay;

    @Nullable
    private WebView webView;

    @Nullable
    private TextView titleView;

    @Nullable
    private ScriptHandler agentScript;

    @Nullable
    private ValueCallback<Uri[]> pendingFiles;

    @Nullable
    private String fixedTitle;

    public ApplyBrowserController(@NonNull ComponentActivity activity, @NonNull Listener listener) {
        this.activity = activity;
        this.listener = listener;
        this.fileChooser = activity
            .getActivityResultRegistry()
            .register(
                "nomadic-apply-file-chooser-" + System.identityHashCode(this),
                new ActivityResultContracts.StartActivityForResult(),
                this::onFileChosen
            );
        this.backCallback = new OnBackPressedCallback(false) {
            @Override
            public void handleOnBackPressed() {
                if (webView != null && webView.canGoBack()) webView.goBack();
                else hide(true);
            }
        };
        activity.getOnBackPressedDispatcher().addCallback(backCallback);
    }

    /** Document-start scripts and web message listeners are available (Android System WebView 87+). */
    public static boolean isSupported() {
        return (
            WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT) &&
            WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)
        );
    }

    @Nullable
    public static String webViewVersion(Context context) {
        PackageInfo p = WebViewCompat.getCurrentWebViewPackage(context);
        return p == null ? null : p.packageName + " " + p.versionName;
    }

    public boolean isOpen() {
        return webView != null;
    }

    /** Load {@code url} with {@code script} injected into every frame, and show the page. */
    @MainThread
    @SuppressLint({ "SetJavaScriptEnabled", "RequiresFeature" })
    public void open(@NonNull String url, @NonNull String script, @Nullable String title) {
        if (!isSupported()) throw new IllegalStateException("Update Android System WebView from the Play Store to apply from this phone.");
        Uri uri = Uri.parse(url);
        if (!"https".equals(uri.getScheme()) && !"http".equals(uri.getScheme())) throw new IllegalArgumentException("Only http(s) links can be opened.");
        destroyWebView();
        fixedTitle = TextUtils.isEmpty(title) ? null : title;
        buildOverlay();
        WebView wv = webView;
        // Before the first load: the agent must be in place when the first document starts.
        agentScript = WebViewCompat.addDocumentStartJavaScript(wv, script, ALL_ORIGINS);
        WebViewCompat.addWebMessageListener(wv, BRIDGE_NAME, ALL_ORIGINS, this::onPostMessage);
        wv.loadUrl(url);
        show();
    }

    /** Deliver a request to one frame. Throws when that frame's document is gone. */
    @MainThread
    public void post(@NonNull String frameId, @NonNull String data) {
        JavaScriptReplyProxy reply = frames.get(frameId);
        if (reply == null) throw new IllegalArgumentException("frame " + frameId + " is gone");
        reply.postMessage(data);
    }

    @MainThread
    public void show() {
        if (overlay == null || webView == null) return;
        overlay.setVisibility(View.VISIBLE);
        overlay.bringToFront();
        backCallback.setEnabled(true);
        webView.onResume();
    }

    @MainThread
    public void hide(boolean byUser) {
        if (overlay == null) return;
        overlay.setVisibility(View.INVISIBLE);
        backCallback.setEnabled(false);
        if (byUser) listener.onHidden();
    }

    /** Destroy the WebView (cookies stay, so portal sign-ins carry over to the next application). */
    @MainThread
    public void close() {
        boolean wasOpen = webView != null;
        destroyWebView();
        if (wasOpen) listener.onClosed("app");
    }

    /** close() and release the activity hooks. Call from the host's onDestroy. */
    @MainThread
    public void dispose() {
        destroyWebView();
        fileChooser.unregister();
        backCallback.remove();
    }

    public void onPause() {
        if (webView != null) webView.onPause();
    }

    public void onResume() {
        if (webView != null && overlay != null && overlay.getVisibility() == View.VISIBLE) webView.onResume();
    }

    // ── bridge ────────────────────────────────────────────────────────────────

    private void onPostMessage(
        @NonNull WebView view,
        @NonNull WebMessageCompat message,
        @NonNull Uri sourceOrigin,
        boolean isMainFrame,
        @NonNull JavaScriptReplyProxy reply
    ) {
        if (view != webView) return;
        String data = message.getData();
        if (data == null || data.length() > MAX_MESSAGE_CHARS) return;
        JSONObject m;
        try {
            m = new JSONObject(data);
        } catch (JSONException e) {
            return;
        }
        String type = m.optString("t");
        String frameId = m.optString("frameId");
        if (frameId.isEmpty()) return;
        JavaScriptReplyProxy known = frames.get(frameId);
        if ("hello".equals(type)) {
            // A frame id belongs to the frame that announced it first; another frame cannot take it over.
            if (known != null && !known.equals(reply)) return;
            frames.put(frameId, reply);
            try {
                // Which frame is the top one comes from the WebView, not from page script.
                m.put("top", isMainFrame);
                data = m.toString();
            } catch (JSONException e) {
                return;
            }
        } else {
            // Replies, state changes and goodbyes are only accepted from the frame that owns the id.
            if (known == null || !known.equals(reply)) return;
            if ("bye".equals(type)) frames.remove(frameId);
        }
        listener.onMessage(data);
    }

    // ── view ──────────────────────────────────────────────────────────────────

    private int dp(int v) {
        return Math.round(TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, activity.getResources().getDisplayMetrics()));
    }

    @SuppressLint({ "SetJavaScriptEnabled", "RequiresFeature" })
    private void buildOverlay() {
        ViewGroup content = activity.findViewById(android.R.id.content);

        FrameLayout root = new FrameLayout(activity);
        root.setBackgroundColor(Color.WHITE);
        root.setClickable(true); // touches never fall through to the app underneath
        root.setFocusable(true);
        ViewCompat.setElevation(root, dp(16));

        LinearLayout column = new LinearLayout(activity);
        column.setOrientation(LinearLayout.VERTICAL);

        LinearLayout bar = new LinearLayout(activity);
        bar.setOrientation(LinearLayout.HORIZONTAL);
        bar.setGravity(Gravity.CENTER_VERTICAL);
        bar.setPadding(dp(16), 0, dp(4), 0);
        bar.setBackgroundColor(Color.rgb(0xF5, 0xF5, 0xF7));

        TextView title = new TextView(activity);
        title.setSingleLine(true);
        title.setEllipsize(TextUtils.TruncateAt.END);
        title.setTextColor(Color.rgb(0x1D, 0x1D, 0x1F));
        title.setTextSize(TypedValue.COMPLEX_UNIT_SP, 15);
        title.setTypeface(Typeface.DEFAULT_BOLD);
        title.setText(fixedTitle != null ? fixedTitle : "Application");
        ViewCompat.setAccessibilityHeading(title, true);
        bar.addView(title, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));

        Button back = new Button(activity, null, android.R.attr.borderlessButtonStyle);
        back.setText("Back to Nomadic");
        back.setAllCaps(false);
        back.setTextColor(Color.rgb(0x00, 0x66, 0xCC));
        back.setOnClickListener(v -> hide(true));
        bar.addView(back, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, dp(48)));

        column.addView(bar, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(52)));

        WebView wv = new WebView(activity);
        configure(wv);
        column.addView(wv, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f));
        root.addView(column, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        // Edge to edge (target SDK 35+): keep the bar below the status bar and the page above the keyboard.
        ViewCompat.setOnApplyWindowInsetsListener(root, (v, insets) -> {
            Insets sys = insets.getInsets(WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout());
            Insets ime = insets.getInsets(WindowInsetsCompat.Type.ime());
            v.setPadding(sys.left, sys.top, sys.right, Math.max(sys.bottom, ime.bottom));
            return WindowInsetsCompat.CONSUMED;
        });

        content.addView(root, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        ViewCompat.requestApplyInsets(root);

        overlay = root;
        webView = wv;
        titleView = title;
    }

    @SuppressLint({ "SetJavaScriptEnabled", "RequiresFeature" })
    private void configure(WebView wv) {
        WebSettings s = wv.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        // target=_blank and window.open stay in this WebView, where the agent is.
        s.setSupportMultipleWindows(false);
        s.setJavaScriptCanOpenWindowsAutomatically(false);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        s.setMediaPlaybackRequiresUserGesture(true);
        s.setUseWideViewPort(true);
        s.setLoadWithOverviewMode(true);
        s.setBuiltInZoomControls(true);
        s.setDisplayZoomControls(false);
        if (WebViewFeature.isFeatureSupported(WebViewFeature.SAFE_BROWSING_ENABLE)) WebSettingsCompat.setSafeBrowsingEnabled(s, true);

        CookieManager cookies = CookieManager.getInstance();
        cookies.setAcceptCookie(true);
        // Embedded boards (Greenhouse iframe on a company site) need their own cookies.
        cookies.setAcceptThirdPartyCookies(wv, true);

        wv.setWebViewClient(
            new WebViewClient() {
                @Override
                public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                    Uri u = request.getUrl();
                    String scheme = u.getScheme() == null ? "" : u.getScheme().toLowerCase();
                    if (!scheme.equals("http") && !scheme.equals("https")) {
                        if (request.isForMainFrame()) listener.onBlocked("external_link", u.toString());
                        return true;
                    }
                    // Google refuses OAuth in embedded WebViews ("disallowed_useragent"); say so instead of showing its error.
                    if (request.isForMainFrame() && "accounts.google.com".equalsIgnoreCase(u.getHost())) {
                        listener.onBlocked("google_sign_in", u.toString());
                        return true;
                    }
                    return false;
                }

                @Override
                public void onPageStarted(WebView view, String url, android.graphics.Bitmap favicon) {
                    listener.onNavigation(url, true);
                }

                @Override
                public void onPageFinished(WebView view, String url) {
                    listener.onNavigation(url, false);
                }

                @Override
                public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
                    // Without this the whole app is killed with the page's renderer.
                    if (view == webView) {
                        destroyWebView();
                        listener.onClosed("crashed");
                    }
                    return true;
                }
            }
        );

        wv.setWebChromeClient(
            new WebChromeClient() {
                @Override
                public void onReceivedTitle(WebView view, String title) {
                    if (fixedTitle == null && titleView != null && !TextUtils.isEmpty(title)) titleView.setText(title);
                }

                @Override
                public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                    // The candidate tapped an upload button themselves: open the system file picker.
                    if (pendingFiles != null) pendingFiles.onReceiveValue(null);
                    pendingFiles = callback;
                    try {
                        fileChooser.launch(params.createIntent());
                        return true;
                    } catch (ActivityNotFoundException e) {
                        pendingFiles = null;
                        return false;
                    }
                }

                @Override
                public void onPermissionRequest(PermissionRequest request) {
                    request.deny(); // camera / microphone are never needed to apply
                }

                @Override
                public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback callback) {
                    callback.invoke(origin, false, false);
                }
            }
        );
    }

    private void onFileChosen(ActivityResult result) {
        ValueCallback<Uri[]> cb = pendingFiles;
        pendingFiles = null;
        if (cb != null) cb.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(result.getResultCode(), result.getData()));
    }

    @SuppressLint("RequiresFeature")
    private void destroyWebView() {
        frames.clear();
        if (pendingFiles != null) {
            pendingFiles.onReceiveValue(null);
            pendingFiles = null;
        }
        if (agentScript != null) {
            agentScript.remove();
            agentScript = null;
        }
        WebView wv = webView;
        webView = null;
        if (wv != null) {
            WebViewCompat.removeWebMessageListener(wv, BRIDGE_NAME);
            wv.stopLoading();
            wv.setWebChromeClient(null);
            wv.setWebViewClient(new WebViewClient());
            ViewGroup parent = (ViewGroup) wv.getParent();
            if (parent != null) parent.removeView(wv);
            wv.destroy();
        }
        if (overlay != null) {
            ViewGroup parent = (ViewGroup) overlay.getParent();
            if (parent != null) parent.removeView(overlay);
            overlay = null;
        }
        titleView = null;
        backCallback.setEnabled(false);
    }
}
