package com.nomadic.career;

import android.os.CancellationSignal;
import androidx.core.content.ContextCompat;
import androidx.credentials.Credential;
import androidx.credentials.CredentialManager;
import androidx.credentials.CredentialManagerCallback;
import androidx.credentials.CustomCredential;
import androidx.credentials.GetCredentialRequest;
import androidx.credentials.GetCredentialResponse;
import androidx.credentials.exceptions.GetCredentialCancellationException;
import androidx.credentials.exceptions.GetCredentialException;
import androidx.credentials.exceptions.NoCredentialException;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.libraries.identity.googleid.GetSignInWithGoogleOption;
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential;

/**
 * Google sign-in with Android Credential Manager: shows the system account picker and returns a Google ID token
 * issued to the web client id passed in (serverClientId). The token is verified by the google-sign-in Edge Function,
 * exactly like the desktop's. No client secret is involved.
 */
@CapacitorPlugin(name = "NomadicGoogle")
public class GoogleSignInPlugin extends Plugin {

    @PluginMethod
    public void signIn(PluginCall call) {
        String serverClientId = call.getString("serverClientId", "");
        String nonce = call.getString("nonce");
        if (serverClientId == null || serverClientId.isEmpty()) {
            call.reject("Google sign-in is not configured for this build.", "unconfigured");
            return;
        }

        GetSignInWithGoogleOption.Builder option = new GetSignInWithGoogleOption.Builder(serverClientId);
        if (nonce != null && !nonce.isEmpty()) option.setNonce(nonce);
        GetCredentialRequest request = new GetCredentialRequest.Builder().addCredentialOption(option.build()).build();

        CredentialManager manager = CredentialManager.create(getContext());
        manager.getCredentialAsync(
            getActivity(),
            request,
            new CancellationSignal(),
            ContextCompat.getMainExecutor(getContext()),
            new CredentialManagerCallback<GetCredentialResponse, GetCredentialException>() {
                @Override
                public void onResult(GetCredentialResponse response) {
                    Credential credential = response.getCredential();
                    if (credential instanceof CustomCredential
                        && GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL.equals(credential.getType())) {
                        try {
                            GoogleIdTokenCredential google = GoogleIdTokenCredential.createFrom(((CustomCredential) credential).getData());
                            JSObject result = new JSObject();
                            result.put("idToken", google.getIdToken());
                            call.resolve(result);
                        } catch (Exception e) {
                            call.reject("Google returned an unreadable sign-in.", "failed");
                        }
                    } else {
                        call.reject("Google returned an unexpected sign-in type.", "failed");
                    }
                }

                @Override
                public void onError(GetCredentialException e) {
                    String code = e instanceof GetCredentialCancellationException ? "cancelled"
                        : e instanceof NoCredentialException ? "no_account" : "failed";
                    call.reject(e.getMessage() != null ? e.getMessage() : "Google sign-in failed.", code);
                }
            }
        );
    }
}
