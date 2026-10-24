package com.example.chisto

/** Минимальный разбор IPv4/UDP — ровно столько, сколько нужно для DNS. */
class Packet private constructor(
    private val src: ByteArray, private val dst: ByteArray,
    private val srcPort: Int, val dstPort: Int, val payload: ByteArray,
) {
    /** Ответ: меняем местами адреса и порты. */
    fun reply(data: ByteArray): ByteArray {
        val total = 20 + 8 + data.size
        val p = ByteArray(total)
        p[0] = 0x45; p[8] = 64; p[9] = 17
        p[2] = (total shr 8).toByte(); p[3] = total.toByte()
        System.arraycopy(dst, 0, p, 12, 4)
        System.arraycopy(src, 0, p, 16, 4)
        val sum = checksum(p, 0, 20)
        p[10] = (sum shr 8).toByte(); p[11] = sum.toByte()
        p[20] = (dstPort shr 8).toByte(); p[21] = dstPort.toByte()
        p[22] = (srcPort shr 8).toByte(); p[23] = srcPort.toByte()
        val udpLen = 8 + data.size
        p[24] = (udpLen shr 8).toByte(); p[25] = udpLen.toByte()
        // Контрольная сумма UDP в IPv4 необязательна: 0 = «не считали».
        System.arraycopy(data, 0, p, 28, data.size)
        return p
    }

    companion object {
        fun parseUdp(b: ByteArray, n: Int): Packet? {
            if (n < 28 || (b[0].toInt() shr 4) != 4 || b[9].toInt() != 17) return null
            val ihl = (b[0].toInt() and 0x0f) * 4
            if (n < ihl + 8) return null
            val srcPort = u16(b, ihl)
            val dstPort = u16(b, ihl + 2)
            val len = minOf(u16(b, ihl + 4), n - ihl) - 8
            if (len <= 12) return null
            return Packet(b.copyOfRange(12, 16), b.copyOfRange(16, 20), srcPort, dstPort,
                b.copyOfRange(ihl + 8, ihl + 8 + len))
        }

        private fun u16(b: ByteArray, o: Int) = ((b[o].toInt() and 0xff) shl 8) or (b[o + 1].toInt() and 0xff)

        private fun checksum(b: ByteArray, off: Int, len: Int): Int {
            var sum = 0L
            var i = off
            while (i < off + len) { sum += u16(b, i); i += 2 }
            while (sum shr 16 != 0L) sum = (sum and 0xffff) + (sum shr 16)
            return (sum.inv() and 0xffff).toInt()
        }
    }
}
