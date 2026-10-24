package com.example.chisto

import android.app.Activity
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Paint
import android.net.VpnService
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.widget.TextView

class MainActivity : Activity() {
    private lateinit var status: TextView
    private lateinit var toggle: TextView
    private lateinit var privateDns: TextView
    private lateinit var privateDnsNote: TextView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)
        status = findViewById(R.id.status)
        toggle = findViewById(R.id.toggle)
        privateDns = findViewById(R.id.privateDns)
        privateDnsNote = findViewById(R.id.privateDnsNote)
        findViewById<TextView>(R.id.server).text = getString(R.string.server, BuildConfig.DOH_HOST)
        listOf(toggle, privateDns).forEach { it.paintFlags = it.paintFlags or Paint.UNDERLINE_TEXT_FLAG }

        toggle.setOnClickListener {
            if (DnsVpnService.running) {
                startService(Intent(this, DnsVpnService::class.java).setAction(DnsVpnService.ACTION_STOP))
                render(false)
            } else {
                // Системное окно «Запрос на подключение». Без согласия пользователя VPN не включится.
                val consent = VpnService.prepare(this)
                if (consent != null) startActivityForResult(consent, REQ_VPN) else startVpn()
            }
        }

        privateDns.setOnClickListener { onPrivateDns() }
        // Без DoT на сервере «Частный DNS» оставил бы телефон без интернета — кнопку не показываем.
        if (!BuildConfig.HAS_DOT) findViewById<android.view.View>(R.id.privateDnsBlock).visibility = android.view.View.GONE
    }

    override fun onResume() {
        super.onResume()
        render(DnsVpnService.running)
    }

    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode == REQ_VPN && resultCode == RESULT_OK) startVpn()
    }

    private fun startVpn() {
        startService(Intent(this, DnsVpnService::class.java))
        // Сервис включается не мгновенно и может не включиться — показываем то, что есть на деле.
        status.postDelayed({ render(DnsVpnService.running) }, 700)
    }

    private fun render(on: Boolean) {
        status.setText(if (on) R.string.on else R.string.off)
        status.setTextColor(getColor(if (on) R.color.ok else R.color.warn))
        toggle.setText(if (on) R.string.disable else R.string.enable)
        privateDns.setText(if (canWriteSecure()) R.string.private_dns_set else R.string.private_dns_copy)
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.P) {
            privateDns.isEnabled = false
            privateDnsNote.text = "На этой версии Android «Частного DNS» нет — используйте кнопку выше."
        }
    }

    private fun canWriteSecure() =
        checkSelfPermission("android.permission.WRITE_SECURE_SETTINGS") == PackageManager.PERMISSION_GRANTED

    // Обычное приложение не может само включить «Частный DNS» — это делает пользователь в настройках.
    // Исключение: владелец телефона сам выдал WRITE_SECURE_SETTINGS через adb (см. android-app/README.md).
    private fun onPrivateDns() {
        if (canWriteSecure()) {
            Settings.Global.putString(contentResolver, "private_dns_mode", "hostname")
            Settings.Global.putString(contentResolver, "private_dns_specifier", BuildConfig.DOH_HOST)
            privateDnsNote.setText(R.string.private_dns_done)
            return
        }
        val clip = getSystemService(ClipboardManager::class.java)
        clip.setPrimaryClip(ClipData.newPlainText("DNS", BuildConfig.DOH_HOST))
        privateDnsNote.setText(R.string.private_dns_copied)
        startActivity(Intent(Settings.ACTION_WIRELESS_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }

    companion object { private const val REQ_VPN = 1 }
}
