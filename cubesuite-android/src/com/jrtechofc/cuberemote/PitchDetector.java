/*
 * Cube Remote · Copyright (c) 2026 José Renato · Jr_Tech_OFC. Todos os direitos reservados.
 */
package com.jrtechofc.cuberemote;

/**
 * Detector de frequência fundamental (algoritmo YIN, de Cheveigné & Kawahara, 2002).
 *
 * Recebe um bloco de amostras (float, -1..1) e devolve a frequência em Hz da nota tocada.
 * Faixa útil: 60 a 1400 Hz (da corda E grave em afinações baixas até as notas agudas da guitarra).
 * Java puro: testado no computador (tests/PitchDetectorTest.java).
 */
public final class PitchDetector {

    /** Resultado de uma análise. hz = 0 quando não há nota clara. */
    public static final class Result {
        public final double hz;
        /** 0..1: quanto o sinal é periódico (1 = nota limpa). */
        public final double clarity;
        /** Nível RMS do bloco (0..1). */
        public final double rms;

        Result(double hz, double clarity, double rms) {
            this.hz = hz;
            this.clarity = clarity;
            this.rms = rms;
        }
    }

    private static final double MIN_HZ = 60.0, MAX_HZ = 1400.0;
    private static final double THRESHOLD = 0.12;
    private static final double GATE_RMS = 0.002;

    private final int sampleRate;
    private final int window;
    private final int minTau, maxTau;
    private final double[] diff;

    /** @param blockSize tamanho dos blocos que serão analisados (ex.: 4096 a 48 kHz) */
    public PitchDetector(int sampleRate, int blockSize) {
        this.sampleRate = sampleRate;
        this.maxTau = (int) Math.ceil(sampleRate / MIN_HZ);
        this.minTau = Math.max(2, (int) Math.floor(sampleRate / MAX_HZ));
        if (blockSize < maxTau * 2) throw new IllegalArgumentException("bloco pequeno demais para 60 Hz");
        this.window = blockSize - maxTau;
        this.diff = new double[maxTau + 1];
    }

    public Result detect(float[] x) {
        double sum = 0;
        for (int i = 0; i < window + maxTau && i < x.length; i++) sum += x[i] * x[i];
        double rms = Math.sqrt(sum / Math.min(x.length, window + maxTau));
        if (rms < GATE_RMS) return new Result(0, 0, rms);

        // 1) função diferença d(tau)
        for (int tau = 1; tau <= maxTau; tau++) {
            double d = 0;
            for (int i = 0; i < window; i++) {
                double delta = x[i] - x[i + tau];
                d += delta * delta;
            }
            diff[tau] = d;
        }
        // 2) diferença normalizada cumulativa d'(tau)
        diff[0] = 1;
        double running = 0;
        for (int tau = 1; tau <= maxTau; tau++) {
            running += diff[tau];
            diff[tau] = running == 0 ? 1 : diff[tau] * tau / running;
        }
        // 3) primeiro mínimo abaixo do limiar (evita erros de oitava)
        int best = -1;
        for (int tau = minTau; tau <= maxTau; tau++) {
            if (diff[tau] < THRESHOLD) {
                while (tau + 1 <= maxTau && diff[tau + 1] < diff[tau]) tau++;
                best = tau;
                break;
            }
        }
        if (best < 0) {   // sem mínimo claro: usa o menor valor, se ainda for razoável
            double min = Double.MAX_VALUE;
            for (int tau = minTau; tau <= maxTau; tau++) if (diff[tau] < min) { min = diff[tau]; best = tau; }
            if (min > 0.35) return new Result(0, 1 - min, rms);
        }
        // 4) interpolação parabólica para precisão abaixo de 1 amostra
        double tau = best;
        if (best > minTau && best < maxTau) {
            double s0 = diff[best - 1], s1 = diff[best], s2 = diff[best + 1];
            double den = 2 * (2 * s1 - s2 - s0);
            if (den != 0) tau = best + (s2 - s0) / den;
        }
        double clarity = Math.max(0, Math.min(1, 1 - diff[best]));
        return new Result(sampleRate / tau, clarity, rms);
    }
}
