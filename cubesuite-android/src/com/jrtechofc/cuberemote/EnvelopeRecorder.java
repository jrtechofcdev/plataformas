/*
 * Cube Remote · Copyright (c) 2026 José Renato · Jr_Tech_OFC. Todos os direitos reservados.
 */
package com.jrtechofc.cuberemote;

import android.media.AudioFormat;
import android.media.AudioRecord;
import android.media.MediaRecorder;

/**
 * Grava alguns segundos do microfone e devolve o "envelope": o nível do som (RMS) a cada 1 ms.
 * Usado para medir o tempo do delay: com uma nota abafada, os ecos aparecem como picos
 * espaçados no envelope (a análise fica em assets/www/js/delay.js).
 */
public final class EnvelopeRecorder {
    private static final int SR = 48000, WIN = SR / 1000;   // 48 amostras = 1 ms

    private EnvelopeRecorder() {}

    public static float[] record(int ms) throws Exception {
        ms = Math.max(500, Math.min(8000, ms));
        int min = AudioRecord.getMinBufferSize(SR, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT);
        AudioRecord rec = new AudioRecord(MediaRecorder.AudioSource.VOICE_RECOGNITION, SR, AudioFormat.CHANNEL_IN_MONO,
                AudioFormat.ENCODING_PCM_16BIT, Math.max(min, SR / 2));
        if (rec.getState() != AudioRecord.STATE_INITIALIZED) { rec.release(); throw new Exception("Não foi possível abrir o microfone"); }
        float[] env = new float[ms];
        short[] buf = new short[WIN * 20];
        int filled = 0;                  // amostras lidas
        double acc = 0;
        int inWin = 0, idx = 0;
        try {
            rec.startRecording();
            while (idx < ms) {
                int n = rec.read(buf, 0, buf.length);
                if (n <= 0) continue;
                for (int i = 0; i < n && idx < ms; i++) {
                    double v = buf[i] / 32768.0;
                    acc += v * v;
                    if (++inWin == WIN) { env[idx++] = (float) Math.sqrt(acc / WIN); acc = 0; inWin = 0; }
                }
                filled += n;
            }
        } finally {
            try { rec.stop(); } catch (Exception ignored) {}
            rec.release();
        }
        return env;
    }
}
