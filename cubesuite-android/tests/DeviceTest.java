import com.jrtechofc.cuberemote.CubeDevice;
import java.io.*;
import java.util.*;

/** Testa CubeDevice (Java) contra o simulador Python da versão PC. */
public class DeviceTest {
    static Process py; static BufferedWriter w; static BufferedReader r;

    static String hex(byte[] b) { StringBuilder s = new StringBuilder(); for (byte x : b) s.append(String.format("%02x", x)); return s.toString(); }
    static byte[] unhex(String h) { byte[] b = new byte[h.length() / 2]; for (int i = 0; i < b.length; i++) b[i] = (byte) Integer.parseInt(h.substring(2 * i, 2 * i + 2), 16); return b; }
    static void check(boolean ok, String what) { if (!ok) throw new AssertionError(what); System.out.println("  ok  " + what); }

    public static void main(String[] a) throws Exception {
        py = new ProcessBuilder("python3", a[0], a.length > 1 ? a[1] : "4F06").redirectErrorStream(true).start();
        w = new BufferedWriter(new OutputStreamWriter(py.getOutputStream()));
        r = new BufferedReader(new InputStreamReader(py.getInputStream()));
        final Deque<byte[]> q = new ArrayDeque<>();
        CubeDevice d = new CubeDevice(new CubeDevice.Link() {
            public void send(byte[] m) throws Exception { w.write(hex(m) + "\n"); w.flush(); q.add(unhex(r.readLine())); }
            public byte[] receive(long t) { return q.poll(); }
            public void clear() { q.clear(); }
        });
        d.connect();
        check(d.model.equals("Cube Baby") && d.generation == 2, "identificação: " + d.model + " " + d.name + " fw " + d.version + String.format(" pid 0x%04X", d.productId));
        int[][] p = d.readPresets();
        check(p[0][5] == 38 && p[0][0] == 2, "leitura dos presets (A: volume=38, type=2)");
        d.setParam(1, 1, 6);
        d.setParam(2, 11, 0);
        d.setParam(0, 7, 200);              // passa do máximo: limitado a 127
        int[][] q2 = d.readPresets();
        check(q2[1][1] == 6 && q2[2][11] == 0 && q2[0][7] == 127, "ajuste ao vivo (gain B, bloco B do preset C)");
        d.setLoopback(true);
        check(d.getLoopback(), "USB loopback ligado");
        float[] ir = new float[512]; for (int i = 0; i < 512; i++) ir[i] = (float) Math.exp(-i / 30.0);
        d.irPreview(ir, 50);
        d.irSave(0, ir, 70);
        w.write("DUMP\n"); w.flush();
        String[] dump = r.readLine().split(" ");
        check(dump[1].startsWith("01"), "prévia de IR ativada na RAM (flag 0x764 = 1)");
        check(dump[2].startsWith("00000000") && dump[2].substring(8, 16).equals("3333333f"), "IR salvo na flash (distância 0.7)");
        int[][] f = d.factoryPresets();
        check(f[1][1] == 3, "presets de fábrica restaurados");
        py.destroy();
        System.out.println("TODOS OS TESTES PASSARAM");
    }
}
