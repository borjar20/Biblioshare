package app.biblioshare.mobile;

import android.content.Intent;
import android.os.Bundle;
import android.webkit.WebView;

import androidx.activity.OnBackPressedCallback;

import com.getcapacitor.BridgeActivity;

import app.biblioshare.mobile.auth.NativeAuthPlugin;
import app.biblioshare.mobile.widgets.BiblioshareWidgetPlugin;
import app.biblioshare.mobile.widgets.WidgetDeepLinks;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Los plugins locales se registran ANTES de super.onCreate (doc de Capacitor).
        registerPlugin(BiblioshareWidgetPlugin.class);
        registerPlugin(NativeAuthPlugin.class);
        super.onCreate(savedInstanceState);
        registerBackNavigation();
        // Arranque en frío desde un widget: el intent trae la ruta interna.
        WidgetDeepLinks.handle(this.bridge, getIntent());
    }

    /**
     * Gesto/botón «atrás» = retroceder en el historial del WebView, no cerrar la app.
     *
     * Sin ningún callback registrado, AppCompatActivity trata el back como "cierra
     * la activity", que es exactamente el síntoma. El bridge de Capacitor 8 NO trae
     * manejo de back (vive en @capacitor/app, que este proyecto no usa), así que se
     * registra aquí: 12 líneas nativas en vez de una dependencia nueva.
     *
     * canGoBack()/goBack() del WebView cuentan también las entradas de
     * history.pushState, que es como navega el App Router de Next — incluidas las
     * rutas interceptadas de los modales, así que el back los cierra igual que su ✕.
     * En la primera entrada del historial se desactiva el callback y se reenvía el
     * back al despachador: la app se cierra como siempre.
     */
    private void registerBackNavigation() {
        getOnBackPressedDispatcher()
            .addCallback(
                this,
                new OnBackPressedCallback(true) {
                    @Override
                    public void handleOnBackPressed() {
                        WebView webView = bridge != null ? bridge.getWebView() : null;
                        if (webView != null && webView.canGoBack()) {
                            webView.goBack();
                            return;
                        }
                        setEnabled(false);
                        MainActivity.this.getOnBackPressedDispatcher().onBackPressed();
                        setEnabled(true);
                    }
                }
            );
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        // App ya abierta (launchMode singleTask): mismo punto de entrada único.
        WidgetDeepLinks.handle(this.bridge, intent);
    }
}
