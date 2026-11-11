import com.jrtechofc.cuberemote.PitchDetector;

import java.util.Random;

/** Testa o detector do afinador com sinais sintéticos parecidos com cordas de guitarra. */
public class PitchDetectorTest {
    static final int SR = 48000, N = 4096;

    static float[] tone(double hz, double[] harmonics, double noise, long seed) {
        Random r = new Random(seed);
        float[] x = new float[N];
        double phase = r.nextDouble() * Math.PI * 2;
        for (int i = 0; i < N; i++) {
            double t = (double) i / SR, v = 0;
            for (int h = 0; h < harmonics.length; h++) v += harmonics[h] * Math.sin(2 * Math.PI * hz * (h + 1) * t + phase * (h + 1));
            x[i] = (float) (0.3 * v + noise * (r.nextDouble() * 2 - 1));
        }
        return x;
    }

    static double cents(double got, double want) { return 1200 * Math.log(got / want) / Math.log(2); }

    public static void main(String[] a) {
        PitchDetector pd = new PitchDetector(SR, N);
        String[] names = {"E2", "A2", "D3", "G3", "B3", "E4", "A4"};
        double[] hz = {82.41, 110.00, 146.83, 196.00, 246.94, 329.63, 440.00};
        double[] pure = {1};
        double[] guitar = {1, 0.8, 0.6, 0.45, 0.3, 0.2};      // fundamental + harmônicos
        double[] weakFund = {0.35, 1, 0.7, 0.5, 0.3};         // fundamental fraca (caso difícil)
        double worst = 0;
        for (int i = 0; i < hz.length; i++) {
            for (double[] spec : new double[][]{pure, guitar, weakFund}) {
                for (double detune : new double[]{-30, 0, 17}) {
                    double want = hz[i] * Math.pow(2, detune / 1200);
                    PitchDetector.Result r = pd.detect(tone(want, spec, 0.02, i * 31 + (long) detune));
                    double c = cents(r.hz, want);
                    worst = Math.max(worst, Math.abs(c));
                    if (Math.abs(c) > 1.0) throw new AssertionError(String.format("%s %+.0f cents: medido %.3f Hz, esperado %.3f Hz (%.2f cents)", names[i], detune, r.hz, want, c));
                }
            }
            System.out.printf("  ok  %-3s %.2f Hz%n", names[i], hz[i]);
        }
        PitchDetector.Result silent = pd.detect(new float[N]);
        if (silent.hz != 0) throw new AssertionError("silêncio deveria dar 0 Hz");
        System.out.printf("  ok  silêncio = sem nota%nMaior erro: %.3f cents%nTODOS OS TESTES DO AFINADOR PASSARAM%n", worst);
    }
}
