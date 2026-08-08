package app.biblioshare.mobile;

import android.content.Intent;
import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

import app.biblioshare.mobile.auth.NativeAuthPlugin;
import app.biblioshare.mobile.reading.ReadingSessionController;
import app.biblioshare.mobile.reading.ReadingSessionService;
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
        handleWidgetIntent(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        // App ya abierta (launchMode singleTask): mismo punto de entrada único.
        handleWidgetIntent(intent);
    }

    // Terminar/■ de la notificación llega aquí como activity PendingIntent directo
    // (no un trampolín de notificación, prohibido en targetSdk 31+): resuelve el
    // elapsed REAL en el momento del toque y lo convierte en la ruta de registro
    // antes de delegar en WidgetDeepLinks como cualquier otro deep link.
    private void handleWidgetIntent(Intent intent) {
        if (intent != null && intent.getBooleanExtra(ReadingSessionService.EXTRA_FINISH_SESSION, false)) {
            intent.removeExtra(ReadingSessionService.EXTRA_FINISH_SESSION);
            String href = ReadingSessionController.INSTANCE.finishFromNotification(this);
            if (href != null) intent.putExtra(WidgetDeepLinks.EXTRA_PATH, href);
        }
        WidgetDeepLinks.handle(this.bridge, intent);
    }
}
