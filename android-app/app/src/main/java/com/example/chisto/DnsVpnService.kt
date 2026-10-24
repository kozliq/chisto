package com.example.chisto

import android.content.Intent
import android.net.VpnService
import android.os.ParcelFileDescriptor
import java.io.FileInputStream
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors

/**
 * Локальный VPN только для DNS.
 *
 * В туннель маршрутизируется один адрес — фальшивый DNS-сервер 10.111.222.1. Весь остальной трафик
 * идёт мимо туннеля, как без приложения. DNS-запрос:
 *  - домен из локального списка (filters/build/dns.txt) → сразу ответ 0.0.0.0;
 *  - иначе → пересылаем на наш DoH-сервер, ответ возвращаем приложению.
 * Домены и ответы не записываются ни в файл, ни в logcat.
 */
class DnsVpnService : VpnService() {
    private var tun: ParcelFileDescriptor? = null
    private var reader: Thread? = null
    private val pool = Executors.newFixedThreadPool(4)
    private lateinit var blocklist: Blocklist

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_STOP) {
            stop()
            return START_NOT_STICKY
        }
        if (tun == null) start()
        return START_STICKY
    }

    private fun start() {
        blocklist = Blocklist.fromAssets(assets)
        tun = Builder()
            .setSession(getString(R.string.app_name))
            .addAddress("10.111.222.2", 32)
            .addDnsServer(FAKE_DNS)
            .addRoute(FAKE_DNS, 32)
            .addDisallowedApplication(packageName) // наши DoH-запросы идут мимо туннеля
            .setBlocking(true)
            .establish() ?: return
        running = true
        val fd = tun!!.fileDescriptor
        reader = Thread({ loop(FileInputStream(fd), FileOutputStream(fd)) }, "dns-tun").apply { start() }
    }

    private fun loop(input: FileInputStream, output: FileOutputStream) {
        val buf = ByteArray(32767)
        try {
            while (!Thread.interrupted()) {
                val n = input.read(buf)
                if (n <= 0) continue
                val packet = Packet.parseUdp(buf, n) ?: continue
                if (packet.dstPort != 53) continue
                pool.execute {
                    val answer = resolve(packet.payload) ?: return@execute
                    val reply = packet.reply(answer)
                    synchronized(output) { output.write(reply) }
                }
            }
        } catch (_: Exception) {
            // Туннель закрыт — выходим.
        }
    }

    private fun resolve(query: ByteArray): ByteArray? {
        val name = Dns.questionName(query)
        if (name != null && blocklist.blocks(name)) return Dns.blockedAnswer(query)
        return try {
            val url = URL("https://${BuildConfig.DOH_HOST}${BuildConfig.DOH_PATH}")
            (url.openConnection() as HttpURLConnection).run {
                connectTimeout = 5000
                readTimeout = 5000
                requestMethod = "POST"
                doOutput = true
                setRequestProperty("Content-Type", "application/dns-message")
                setRequestProperty("Accept", "application/dns-message")
                outputStream.use { it.write(query) }
                if (responseCode != 200) null else inputStream.use { it.readBytes() }
            }
        } catch (_: Exception) {
            Dns.servfail(query)
        }
    }

    private fun stop() {
        running = false
        reader?.interrupt()
        tun?.close()
        tun = null
        stopSelf()
    }

    override fun onRevoke() = stop()
    override fun onDestroy() {
        stop()
        pool.shutdownNow()
        super.onDestroy()
    }

    companion object {
        const val ACTION_STOP = "com.example.chisto.STOP"
        private const val FAKE_DNS = "10.111.222.1"
        @Volatile var running = false
    }
}
