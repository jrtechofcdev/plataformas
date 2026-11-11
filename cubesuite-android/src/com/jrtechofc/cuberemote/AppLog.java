/*
 * Cube Remote · Copyright (c) 2026 José Renato · Jr_Tech_OFC. Todos os direitos reservados.
 */
package com.jrtechofc.cuberemote;

import android.content.Context;
import android.util.Log;

import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.ArrayDeque;
import java.util.Date;
import java.util.Locale;

/**
 * AppLog — sistema de log do app.
 *  • guarda as últimas 3000 linhas na memória (para mostrar na tela);
 *  • grava em arquivo (cuberemote.log, até ~1 MB, depois recomeça) para não perder após fechar;
 *  • avisa a tela a cada linha nova (log ao vivo).
 */
public final class AppLog implements CubeDevice.Logger {
    public interface Listener { void onLine(String line); }

    private static final int MAX_LINES = 3000;
    private static final long MAX_FILE = 1024 * 1024;
    private final ArrayDeque<String> lines = new ArrayDeque<>();
    private final SimpleDateFormat fmt = new SimpleDateFormat("HH:mm:ss.SSS", Locale.US);
    private final File file;
    private volatile Listener listener;

    public AppLog(Context ctx) {
        file = new File(ctx.getFilesDir(), "cuberemote.log");
        if (file.length() > MAX_FILE) file.delete();
    }

    public void setListener(Listener l) { listener = l; }

    @Override public void log(String msg) {
        String line = fmt.format(new Date()) + "  " + msg;
        synchronized (lines) {
            lines.addLast(line);
            while (lines.size() > MAX_LINES) lines.removeFirst();
        }
        Log.i("CubeRemote", msg);
        try (FileOutputStream f = new FileOutputStream(file, true)) {
            f.write((line + "\n").getBytes(StandardCharsets.UTF_8));
        } catch (Exception ignored) {}
        Listener l = listener;
        if (l != null) l.onLine(line);
    }

    public String all() {
        StringBuilder sb = new StringBuilder();
        synchronized (lines) { for (String s : lines) sb.append(s).append('\n'); }
        return sb.toString();
    }

    public void clear() {
        synchronized (lines) { lines.clear(); }
        file.delete();
    }
}
