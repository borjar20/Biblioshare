package app.biblioshare.mobile;

import android.content.Intent;
import android.os.Bundle;

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
        // Arranque en frío desde un widget: el intent trae la ruta interna.
        WidgetDeepLinks.handle(this.bridge, getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        // App ya abierta (launchMode singleTask): mismo punto de entrada único.
        WidgetDeepLinks.handle(this.bridge, intent);
    }
}
