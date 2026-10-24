package com.example.chisto

import android.content.res.AssetManager

object Dns {
    /** Имя из первого вопроса, в нижнем регистре. */
    fun questionName(q: ByteArray): String? {
        if (q.size < 17) return null
        val sb = StringBuilder()
        var o = 12
        while (o < q.size) {
            val len = q[o].toInt() and 0xff
            if (len == 0) return sb.toString().lowercase()
            if (len and 0xc0 != 0 || o + 1 + len > q.size) return null
            if (sb.isNotEmpty()) sb.append('.')
            sb.append(String(q, o + 1, len, Charsets.US_ASCII))
            o += 1 + len
        }
        return null
    }

    private fun questionEnd(q: ByteArray): Int {
        var o = 12
        while (o < q.size && q[o].toInt() != 0) o += 1 + (q[o].toInt() and 0xff)
        return o + 1 + 4
    }

    /** Ответ «0.0.0.0» на A и «::» на AAAA, пустой ответ на остальные типы. */
    fun blockedAnswer(q: ByteArray): ByteArray {
        val end = questionEnd(q).coerceAtMost(q.size)
        val qtype = ((q[end - 4].toInt() and 0xff) shl 8) or (q[end - 3].toInt() and 0xff)
        val rdata = when (qtype) { 1 -> ByteArray(4); 28 -> ByteArray(16); else -> null }
        val head = q.copyOfRange(0, end)
        head[2] = (0x81).toByte()          // QR=1, RD=1
        head[3] = (0x80).toByte()          // RA=1, RCODE=0
        head[6] = 0; head[7] = if (rdata != null) 1 else 0
        head[8] = 0; head[9] = 0; head[10] = 0; head[11] = 0
        if (rdata == null) return head
        val rr = byteArrayOf(
            0xc0.toByte(), 12,                         // имя — ссылка на вопрос
            0, qtype.toByte(), 0, 1,                   // тип, класс IN
            0, 0, 0, 10,                               // TTL 10 с
            0, rdata.size.toByte(),
        ) + rdata
        return head + rr
    }

    fun servfail(q: ByteArray): ByteArray {
        val end = questionEnd(q).coerceAtMost(q.size)
        val r = q.copyOfRange(0, end)
        r[2] = (0x81).toByte(); r[3] = (0x82).toByte()
        r[6] = 0; r[7] = 0; r[8] = 0; r[9] = 0; r[10] = 0; r[11] = 0
        return r
    }
}

/** Доменные правила вида ||example.com^ и исключения @@||example.com^. Поддомены тоже блокируются. */
class Blocklist(private val block: Set<String>, private val allow: Set<String>) {
    fun blocks(name: String): Boolean {
        var d = name
        while (true) {
            if (d in allow) return false
            if (d in block) return true
            val dot = d.indexOf('.')
            if (dot < 0) return false
            d = d.substring(dot + 1)
        }
    }

    companion object {
        private val RULE = Regex("""^(@@)?\|\|([a-z0-9._-]+)\^(\${'$'}important)?$""")
        fun fromAssets(assets: AssetManager): Blocklist {
            val block = HashSet<String>()
            val allow = HashSet<String>()
            runCatching {
                assets.open("dns.txt").bufferedReader().useLines { lines ->
                    for (line in lines) {
                        val m = RULE.matchEntire(line.trim()) ?: continue
                        (if (m.groupValues[1].isNotEmpty()) allow else block).add(m.groupValues[2])
                    }
                }
            }
            return Blocklist(block, allow)
        }
    }
}
