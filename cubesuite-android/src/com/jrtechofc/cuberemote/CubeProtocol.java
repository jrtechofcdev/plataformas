package com.jrtechofc.cuberemote;

import java.io.ByteArrayOutputStream;

/**
 * CubeProtocol — formato das mensagens da Cube Baby (mesmo do CubeSuite para PC).
 *
 *   SysEx:   F0 <bytes de 7 bits> F7
 *   Pacote:  59 00 | CMD | TAMANHO (3 bytes LE) | DADOS | CHECKSUM = NOT(soma dos DADOS)
 *
 * Comandos: 0x11 identificar, 0x21 apagar, 0x22 escrever, 0x23 ler, 0x24 soma16, 0x00 ACK.
 * Classe em Java puro (sem Android) para poder ser testada no computador.
 */
public final class CubeProtocol {
    private CubeProtocol() {}

    public static final int CMD_ACK = 0x00;
    public static final int CMD_IDENTIFY = 0x11;
    public static final int CMD_ERASE = 0x21;
    public static final int CMD_WRITE = 0x22;
    public static final int CMD_READ = 0x23;
    public static final int CMD_CHECKSUM = 0x24;

    public static class ProtocolException extends Exception {
        public ProtocolException(String m) { super(m); }
    }

    /** 8 bits -> fluxo de 7 bits, bit menos significativo primeiro. */
    public static byte[] pack7(byte[] data) {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        int acc = 0, nbits = 0;
        for (byte b : data) {
            acc |= (b & 0xFF) << nbits;
            nbits += 8;
            while (nbits >= 7) {
                out.write(acc & 0x7F);
                acc >>>= 7;
                nbits -= 7;
            }
        }
        if (nbits > 0) out.write(acc & 0x7F);
        return out.toByteArray();
    }

    /** Inverso de pack7. */
    public static byte[] unpack7(byte[] data, int off, int len) {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        int acc = 0, nbits = 0;
        for (int i = off; i < off + len; i++) {
            acc |= (data[i] & 0x7F) << nbits;
            nbits += 7;
            if (nbits >= 8) {
                out.write(acc & 0xFF);
                acc >>>= 8;
                nbits -= 8;
            }
        }
        return out.toByteArray();
    }

    public static byte[] toSysex(byte[] packet) {
        byte[] p = pack7(packet);
        byte[] m = new byte[p.length + 2];
        m[0] = (byte) 0xF0;
        System.arraycopy(p, 0, m, 1, p.length);
        m[m.length - 1] = (byte) 0xF7;
        return m;
    }

    public static byte[] fromSysex(byte[] msg) throws ProtocolException {
        if (msg.length < 2 || (msg[0] & 0xFF) != 0xF0 || (msg[msg.length - 1] & 0xFF) != 0xF7)
            throw new ProtocolException("SysEx inválido");
        return unpack7(msg, 1, msg.length - 2);
    }

    public static int checksum(byte[] d, int off, int len) {
        int s = 0;
        for (int i = off; i < off + len; i++) s += d[i] & 0xFF;
        return (~s) & 0xFF;
    }

    public static byte[] buildPacket(int cmd, byte[] payload) {
        int n = payload.length;
        byte[] p = new byte[6 + n + 1];
        p[0] = 0x59; p[1] = 0x00; p[2] = (byte) cmd;
        p[3] = (byte) n; p[4] = (byte) (n >> 8); p[5] = (byte) (n >> 16);
        System.arraycopy(payload, 0, p, 6, n);
        p[6 + n] = (byte) checksum(payload, 0, n);
        return p;
    }

    /** Valida e devolve só o payload. */
    public static byte[] parsePacket(byte[] pkt, int expectCmd) throws ProtocolException {
        if (pkt.length < 7 || pkt[0] != 0x59 || pkt[1] != 0x00)
            throw new ProtocolException("pacote inválido");
        if ((pkt[2] & 0xFF) != expectCmd)
            throw new ProtocolException(String.format("comando inesperado 0x%02X", pkt[2] & 0xFF));
        int n = (pkt[3] & 0xFF) | ((pkt[4] & 0xFF) << 8) | ((pkt[5] & 0xFF) << 16);
        if (pkt.length < 7 + n) throw new ProtocolException("pacote incompleto");
        if (checksum(pkt, 6, n) != (pkt[6 + n] & 0xFF)) throw new ProtocolException("checksum errado");
        byte[] out = new byte[n];
        System.arraycopy(pkt, 6, out, 0, n);
        return out;
    }

    // ---------- pedidos ----------
    static void putU32(byte[] b, int off, long v) {
        for (int i = 0; i < 4; i++) b[off + i] = (byte) (v >> (8 * i));
    }

    static void putU24(byte[] b, int off, int v) {
        for (int i = 0; i < 3; i++) b[off + i] = (byte) (v >> (8 * i));
    }

    public static long getU32(byte[] b, int off) {
        long v = 0;
        for (int i = 0; i < 4; i++) v |= (long) (b[off + i] & 0xFF) << (8 * i);
        return v;
    }

    public static byte[] reqIdentify() { return buildPacket(CMD_IDENTIFY, new byte[0]); }

    public static byte[] reqErase(int region, long addr) {
        byte[] p = new byte[5]; p[0] = (byte) region; putU32(p, 1, addr);
        return buildPacket(CMD_ERASE, p);
    }

    public static byte[] reqWrite(int region, long addr, byte[] data, int off, int len) {
        byte[] p = new byte[8 + len]; p[0] = (byte) region; putU32(p, 1, addr); putU24(p, 5, len);
        System.arraycopy(data, off, p, 8, len);
        return buildPacket(CMD_WRITE, p);
    }

    public static byte[] reqRead(int region, long addr, int len) {
        byte[] p = new byte[8]; p[0] = (byte) region; putU32(p, 1, addr); putU24(p, 5, len);
        return buildPacket(CMD_READ, p);
    }

    public static byte[] reqChecksum(int region, long addr, int len) {
        byte[] p = new byte[9]; p[0] = (byte) region; putU32(p, 1, addr); putU32(p, 5, len);
        return buildPacket(CMD_CHECKSUM, p);
    }
}
