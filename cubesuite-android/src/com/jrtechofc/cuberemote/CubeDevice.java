package com.jrtechofc.cuberemote;

import java.io.ByteArrayOutputStream;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.util.Arrays;

/**
 * CubeDevice — operações da pedaleira (tradução direta do device.py da versão PC).
 *
 * Mapa de memória:
 *   Região 0 (flash): info em 0x2100/0x180/0x4180, USB Loopback em 0x3000,
 *                     IRs em base + slot*0x1000 (0x808 bytes cada)
 *   Região 4 (RAM):   prévia de IR (0x764 flag, 0x768 distância, 0x76C 512 floats)
 *   Região 5:         presets A/B/C, 16 bytes cada; escrita ao vivo em 0x80000000+offset
 *
 * Java puro: o "Link" é quem realmente envia/recebe (MIDI no Android, simulador nos testes).
 */
public class CubeDevice {

    /** Canal de comunicação com a pedaleira. */
    public interface Link {
        void send(byte[] sysex) throws Exception;
        /** Próxima mensagem SysEx completa, ou null se passar o tempo. */
        byte[] receive(long timeoutMs) throws InterruptedException;
        void clear();
    }

    public static class DeviceException extends Exception {
        public DeviceException(String m) { super(m); }
    }

    /** A pedaleira respondeu "comando não existe neste modelo" (ACK com status ≠ 0). */
    public static class UnsupportedCommandException extends DeviceException {
        public UnsupportedCommandException(String m) { super(m); }
    }

    /** A Cube Baby nova não tem o comando 0x24 (soma16): verificamos lendo de volta. */
    public volatile boolean sum16Supported = true;

    /** Destino das mensagens de log (no Android: AppLog; nos testes: console). */
    public interface Logger { void log(String line); }
    public static volatile Logger logger = null;
    /** Se true, registra cada pacote enviado/recebido (bom para diagnóstico). */
    public static volatile boolean traceBytes = true;

    public static void log(String s) { Logger l = logger; if (l != null) l.log(s); }

    public static String hex(byte[] b, int max) {
        StringBuilder sb = new StringBuilder();
        int n = Math.min(b.length, max);
        for (int i = 0; i < n; i++) sb.append(String.format("%02X ", b[i] & 0xFF));
        if (b.length > max) sb.append("… (+").append(b.length - max).append(")");
        return sb.toString().trim();
    }

    private static String cmdName(int c) {
        switch (c) {
            case 0x00: return "ACK"; case 0x11: return "IDENTIFICAR"; case 0x21: return "APAGAR";
            case 0x22: return "ESCREVER"; case 0x23: return "LER"; case 0x24: return "SOMA16";
            default: return String.format("CMD%02X", c);
        }
    }

    public static final int FLASH = 0, RAM = 4, PRESETS = 5;
    public static final long LIVE = 0x80000000L;
    static final int CHUNK = 0x80, READ_CHUNK = CHUNK - 15, BLOCK = 0x1000, FLASH_SIZE = 0x80000;
    public static final int PRESET_SIZE = 16, IR_SAMPLES = 512, IR_SLOTS = 8;

    /** Presets de fábrica (tabelas do CubeSuite.exe). */
    static final int[] FACTORY = {
        2, 4, 10, 4, 31, 38, 31, 19, 7, 8, 1, 1, 1, 0, 0, 0,
        6, 3, 10, 0, 31, 12, 31, 16, 7, 8, 1, 1, 1, 0, 0, 0,
        0, 5, 11, 0, 31, 32, 31, 19, 7, 8, 1, 1, 1, 0, 0, 0};
    static final int[] FACTORY_4F09 = {
        7, 7, 9, 5, 52, 65, 20, 30, 7, 4, 1, 1, 1, 0, 0, 0,
        4, 2, 5, 5, 44, 70, 23, 30, 7, 5, 1, 1, 1, 0, 0, 0,
        1, 7, 7, 5, 52, 111, 20, 12, 5, 2, 1, 1, 1, 0, 0, 0};

    private final Link link;
    public String name = "", version = "", model = "";
    /** false quando o ID/endereço de IR não é o esperado: bloqueia gravações na flash (IR). */
    public boolean irWritable = true;
    public int productId, generation;
    public long irBase;

    public CubeDevice(Link link) { this.link = link; }

    // ------------------------------------------------------------ básico
    private synchronized byte[] transact(byte[] packet, int expectCmd, long timeoutMs) throws Exception {
        if (traceBytes) log("→ " + cmdName(packet[2] & 0xFF) + " pacote " + hex(packet, 24));
        link.send(CubeProtocol.toSysex(packet));
        long deadline = System.currentTimeMillis() + timeoutMs;
        while (true) {
            long left = deadline - System.currentTimeMillis();
            byte[] msg = left > 0 ? link.receive(left) : null;
            if (msg == null) {
                log("✗ sem resposta para " + cmdName(packet[2] & 0xFF) + " em " + timeoutMs + " ms");
                throw new DeviceException("a pedaleira não respondeu (timeout)");
            }
            try {
                byte[] pkt = CubeProtocol.fromSysex(msg);
                if (CubeProtocol.isHeader(pkt) && (pkt[2] & 0xFF) == expectCmd) {
                    byte[] payload = CubeProtocol.parsePacket(pkt, expectCmd);
                    if (traceBytes) log("← " + cmdName(expectCmd) + " ok, " + payload.length + " bytes: " + hex(payload, 24));
                    return payload;
                }
                // ACK com erro no lugar da resposta esperada = comando não suportado (não espera o timeout)
                if (CubeProtocol.isHeader(pkt) && pkt.length >= 8 && (pkt[2] & 0xFF) == CMD_ACK_ && expectCmd != CMD_ACK_ && pkt[6] != 0) {
                    log("← a pedaleira recusou " + cmdName(packet[2] & 0xFF) + " (status " + pkt[6] + "): comando não suportado neste modelo");
                    throw new UnsupportedCommandException("comando " + cmdName(packet[2] & 0xFF) + " não suportado neste modelo");
                }
                log("← pacote ignorado (esperava " + cmdName(expectCmd) + "): " + hex(pkt, 24));
            } catch (CubeProtocol.ProtocolException e) {
                log("← mensagem não reconhecida (" + e.getMessage() + "): " + hex(msg, 32));
            }
        }
    }

    private void ack(byte[] payload, String what) throws DeviceException {
        if (payload.length < 1 || payload[0] != 0)
            throw new DeviceException(what + " recusado (status " + (payload.length > 0 ? payload[0] : -1) + ")");
    }

    public synchronized byte[] read(int region, long addr, int len) throws Exception {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        while (out.size() < len) {
            int n = Math.min(READ_CHUNK, len - out.size());
            long a = addr + out.size();
            byte[] p = transact(CubeProtocol.reqRead(region, a, n), CubeProtocol.CMD_READ, 2000);
            if (p.length < 8 + n || CubeProtocol.getU32(p, 1) != (a & 0xFFFFFFFFL))
                throw new DeviceException("resposta de leitura inconsistente");
            out.write(p, 8, n);
        }
        return out.toByteArray();
    }

    public synchronized void write(int region, long addr, byte[] data) throws Exception {
        for (int done = 0; done < data.length; ) {
            int n = Math.min(CHUNK, data.length - done);
            ack(transact(CubeProtocol.reqWrite(region, addr + done, data, done, n), CubeProtocol.CMD_ACK, 10000), "gravação");
            done += n;
        }
    }

    public synchronized void erase(long addr) throws Exception {
        ack(transact(CubeProtocol.reqErase(FLASH, addr), CubeProtocol.CMD_ACK, 30000), "apagar bloco");
    }

    public synchronized int sum16(int region, long addr, int len) throws Exception {
        byte[] p = transact(CubeProtocol.reqChecksum(region, addr, len), CubeProtocol.CMD_CHECKSUM, 30000);
        if (p.length < 11) throw new DeviceException("checksum inválido");
        return (p[9] & 0xFF) | ((p[10] & 0xFF) << 8);
    }

    private static final int CMD_ACK_ = 0x00;

    /** Grava na RAM e confere: pela soma16 (modelos antigos) ou lendo de volta (Cube Baby nova). */
    private synchronized void writeRamVerified(long addr, byte[] data) throws Exception {
        write(RAM, addr, data);
        if (sum16Supported) {
            int s = 0;
            for (byte b : data) s += b & 0xFF;
            try {
                if (sum16(RAM, addr, data.length) != (s & 0xFFFF)) throw new DeviceException("verificação da RAM falhou");
                return;
            } catch (UnsupportedCommandException e) {
                sum16Supported = false;
                log("Soma16 indisponível: a verificação passa a ser por leitura de volta");
            }
        }
        try {
            if (!Arrays.equals(read(RAM, addr, data.length), data)) throw new DeviceException("verificação da RAM falhou (leitura diferente)");
        } catch (UnsupportedCommandException e) {
            log("Leitura da RAM indisponível: gravação feita sem verificação");
        }
    }

    /** Escreve na RAM com a "trava" 0x764 = 0 e SEMPRE devolve 1 no final (mesmo se der erro). */
    private synchronized void ramWithLock(long addr, byte[] data) throws Exception {
        write(RAM, 0x764, new byte[]{0});
        try {
            writeRamVerified(addr, data);
        } finally {
            write(RAM, 0x764, new byte[]{1});
        }
    }

    // ------------------------------------------------------------ conexão
    public synchronized void connect() throws Exception {
        link.clear();
        firstInfo = null;
        byte[] p = null;
        // Cabeçalho 00 59 (Cube Baby nova, confirmado) e, se não responder, 59 00 (antiga)
        int[][] heads = {{0x00, 0x59}, {0x59, 0x00}};
        for (int h = 0; h < heads.length && p == null; h++) {
            CubeProtocol.setHeader(heads[h][0], heads[h][1]);
            for (int attempt = 1; attempt <= 2 && p == null; attempt++) {
                log(String.format("Identificação (cabeçalho %02X %02X): tentativa %d/2", heads[h][0], heads[h][1], attempt));
                try { p = transact(CubeProtocol.reqIdentify(), CubeProtocol.CMD_IDENTIFY, 1200); }
                catch (DeviceException e) { if (h == heads.length - 1 && attempt == 2) throw e; }
            }
        }
        parseIdentity(p);
        log("Aparelho respondeu: nome='" + name + "' versão='" + version + "' · " + hex(p, 32));

        long[] order = name.contains("looperpro1") ? new long[]{0x4180, 0x2100, 0x180}
                : name.contains("Cuvave-IR") ? new long[]{0x180, 0x2100, 0x4180}
                : new long[]{0x2100, 0x180, 0x4180};
        for (long addr : order) {
            byte[] info;
            try { info = read(FLASH, addr, 20); }
            catch (DeviceException e) { log(String.format("Bloco de info em 0x%X: %s", addr, e.getMessage())); continue; }
            int pid = (int) CubeProtocol.getU32(info, 4);
            int gen = generationOf(pid);
            log(String.format("Bloco de info em 0x%X: %s → ID 0x%04X (%s)", addr, hex(info, 20), pid,
                    gen < 0 ? "desconhecido" : modelOf(pid)));
            if (gen >= 0) {
                productId = pid;
                generation = gen;
                model = modelOf(pid);
                irBase = CubeProtocol.getU32(info, 16);
                irWritable = irBaseOk(irBase);
                log(String.format("Endereço dos IRs: 0x%X (%s)", irBase, irWritable ? "ok" : "suspeito: gravação de IR bloqueada"));
                return;
            }
            if (firstInfo == null) { firstInfo = info; firstAddr = addr; }
        }
        // ID desconhecido, mas o nome diz que é uma Cube Baby: libera os presets e bloqueia a flash (IR)
        if (name.toLowerCase(java.util.Locale.ROOT).contains("cubebaby")) {
            generation = 2;
            model = "Cube Baby";
            productId = firstInfo != null ? (int) CubeProtocol.getU32(firstInfo, 4) : 0;
            irBase = firstInfo != null ? CubeProtocol.getU32(firstInfo, 16) : 0;
            irWritable = false;
            log(String.format("Cube Baby com ID não catalogado (0x%04X, info em 0x%X): presets liberados, gravação de IR bloqueada por segurança",
                    productId, firstAddr));
            return;
        }
        throw new DeviceException("'" + name + "' respondeu, mas não é uma Cube Baby reconhecida");
    }

    private byte[] firstInfo = null;
    private long firstAddr = 0;

    static boolean irBaseOk(long base) {
        return base > 0 && base % BLOCK == 0 && base + 0x8000 <= FLASH_SIZE;
    }

    /** Nome = letras do início; versão = bytes que vêm depois (formato muda entre modelos). */
    void parseIdentity(byte[] p) {
        StringBuilder nm = new StringBuilder();
        int i = 0;
        while (i < p.length && p[i] >= 0x20 && p[i] < 0x7F) nm.append((char) p[i++]);
        name = nm.toString().trim();
        StringBuilder ver = new StringBuilder();
        boolean digits = true;
        for (int k = i; k < p.length; k++) if (p[k] < 0 || p[k] > 9) digits = false;
        for (int k = i; k < p.length; k++) {
            if (digits) ver.append((char) ('0' + p[k]));
            else ver.append(ver.length() > 0 ? "." : "").append(String.format("%02X", p[k] & 0xFF));
        }
        version = ver.toString();
        // formato antigo (CubeSuite PC): versão em dígitos 0..9 nos bytes 8..18
        if (name.length() > 8 && p.length >= 19) {
            StringBuilder old = new StringBuilder();
            for (int k = 8; k < 19; k++) if (p[k] >= 0 && p[k] < 10) old.append((char) ('0' + p[k]));
            if (old.length() == 11) version = old.toString();
        }
    }

    /** 2 = geração nova (presets), 1 = antiga (só IR), 0 = outro modelo, -1 = desconhecido. */
    static int generationOf(int pid) {
        switch (pid) {
            case 0x272E: case 0x2792: return 1;
            case 0x4EA2: case 0x4E3E: case 0x4F06: case 0x4F09: return 2;
            case 0x4FCE: case 0x5032: case 0x76DF: return 0;
            default: return -1;
        }
    }

    static String modelOf(int pid) {
        if (pid == 0x4FCE) return "Cube Baby AC";
        if (pid == 0x5032 || pid == 0x76DF) return "Cube Baby Bass";
        return "Cube Baby";
    }

    private void require(int gen) throws DeviceException {
        if (generation == 0) throw new DeviceException(model + " ainda não é suportada");
        if (gen > 0 && generation != gen) throw new DeviceException("função só da Cube Baby geração nova");
    }

    // ------------------------------------------------------------ presets
    public synchronized int[][] readPresets() throws Exception {
        require(2);
        byte[] raw = read(PRESETS, 0, PRESET_SIZE * 3);
        int[][] out = new int[3][PRESET_SIZE];
        for (int i = 0; i < 3; i++)
            for (int j = 0; j < PRESET_SIZE; j++) out[i][j] = raw[i * PRESET_SIZE + j] & 0xFF;
        return out;
    }

    /** Muda um byte do preset na hora (knob ou chave de bloco). */
    public synchronized void setParam(int preset, int offset, int value) throws Exception {
        require(2);
        if (preset < 0 || preset > 2 || offset < 0 || offset > 12) throw new DeviceException("parâmetro inválido");
        value = Math.max(0, Math.min(127, value));
        write(PRESETS, LIVE | (preset * PRESET_SIZE + offset), new byte[]{(byte) value});
    }

    public synchronized int[][] factoryPresets() throws Exception {
        require(2);
        int[] src = productId == 0x4F09 ? FACTORY_4F09 : FACTORY;
        byte[] d = new byte[src.length];
        for (int i = 0; i < src.length; i++) d[i] = (byte) src[i];
        write(PRESETS, 0, d);
        return readPresets();
    }

    public synchronized boolean getLoopback() throws Exception {
        require(2);
        return read(FLASH, 0x3000, 1)[0] != 0;
    }

    public synchronized void setLoopback(boolean on) throws Exception {
        require(2);
        write(FLASH, 0x3000, new byte[]{(byte) (on ? 1 : 0)});
    }

    // ------------------------------------------------------------ IR
    static byte[] irPayload(float[] s, int distance) {
        ByteBuffer b = ByteBuffer.allocate(4 + IR_SAMPLES * 4).order(ByteOrder.LITTLE_ENDIAN);
        b.putFloat(distance / 100f);
        for (int i = 0; i < IR_SAMPLES; i++) b.putFloat(i < s.length ? s[i] : 0f);
        return b.array();
    }

    public synchronized void irPreview(float[] samples, int distance) throws Exception {
        require(-1);
        ramWithLock(0x768, irPayload(samples, distance));
    }

    public synchronized void irDistance(int distance) throws Exception {
        require(-1);
        byte[] f = ByteBuffer.allocate(4).order(ByteOrder.LITTLE_ENDIAN).putFloat(distance / 100f).array();
        ramWithLock(0x768, f);
    }

    /**
     * Envia o preset inteiro (16 bytes): primeiro no endereço "ao vivo" (0x80000000 + …),
     * depois no endereço normal — botão "Enviar preset" (teste).
     */
    public synchronized void sendPreset(int preset, int[] values) throws Exception {
        require(2);
        if (preset < 0 || preset > 2 || values.length < 13) throw new DeviceException("preset inválido");
        byte[] d = new byte[PRESET_SIZE];
        for (int i = 0; i < Math.min(PRESET_SIZE, values.length); i++) d[i] = (byte) Math.max(0, Math.min(127, values[i]));
        log("Enviando preset " + "ABC".charAt(preset) + " completo: " + hex(d, 16));
        write(PRESETS, LIVE | (preset * PRESET_SIZE), d);
        write(PRESETS, preset * PRESET_SIZE, d);
    }

    public synchronized void irSave(int slot, float[] samples, int distance) throws Exception {
        require(-1);
        if (slot < 0 || slot >= IR_SLOTS) throw new DeviceException("slot inválido");
        byte[] payload = irPayload(samples, distance);
        byte[] block = new byte[4 + payload.length];             // 4 bytes de flag (0) + dados
        System.arraycopy(payload, 0, block, 4, payload.length);
        if (!irWritable) throw new DeviceException("Gravação de IR bloqueada: endereço de memória dos IRs não confirmado neste modelo");
        long addr = irBase + (long) slot * BLOCK;
        if (addr + block.length > FLASH_SIZE) throw new DeviceException("sem espaço na memória");
        for (long a = addr; a < addr + block.length; a += BLOCK) erase(a);
        write(FLASH, addr, block);
        if (!Arrays.equals(read(FLASH, addr, block.length), block))
            throw new DeviceException("verificação falhou: dados gravados não conferem");
    }
}
