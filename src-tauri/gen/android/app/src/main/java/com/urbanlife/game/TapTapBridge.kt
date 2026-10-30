package com.urbanlife.game

import android.webkit.JavascriptInterface
import android.webkit.WebView
import com.taptap.sdk.cloudsave.ArchiveData
import com.taptap.sdk.cloudsave.ArchiveMetadata
import com.taptap.sdk.cloudsave.TapTapCloudSave
import com.taptap.sdk.cloudsave.internal.TapCloudSaveRequestCallback
import org.json.JSONArray
import org.json.JSONObject
import java.nio.charset.StandardCharsets

/** Narrow bridge for the enhanced Android build. No server-side secret is exposed here. */
class TapTapBridge(
  private val activity: MainActivity,
  private val webView: WebView,
) {
  @JavascriptInterface
  fun showPrivacyPolicy() {
    activity.runOnUiThread { activity.showPrivacyPolicyFromSettings() }
  }

  @JavascriptInterface
  fun postMessage(message: String) {
    try {
      val request = JSONObject(message)
      val id = request.optString("id")
      val action = request.optString("action")
      val payload = request.optJSONObject("payload") ?: JSONObject()
      activity.runOnUiThread { handle(id, action, payload) }
    } catch (_: Exception) {
      // Invalid bridge messages are ignored; they cannot affect the game save.
    }
  }

  private fun handle(id: String, action: String, payload: JSONObject) {
    if (!activity.canUseTapCloud) {
      respond(id, false, error = "TapTap 登录与合规校验完成后才能使用云存档。")
      return
    }
    when (action) {
      "cloud_list" -> listArchives(id)
      "cloud_upload" -> upload(id, payload.optString("data"))
      "cloud_download" -> download(id, payload.optString("uuid"), payload.optString("fileId"))
      else -> respond(id, false, error = "不支持的 TapTap 操作。")
    }
  }

  private fun listArchives(id: String) {
    TapTapCloudSave.getArchiveList(object : TapCloudSaveRequestCallback {
      override fun onArchiveListResult(archiveList: List<ArchiveData>) {
        val result = JSONArray()
        archiveList.forEach { archive -> result.put(archiveJson(archive)) }
        respond(id, true, data = result)
      }

      override fun onRequestError(errorCode: Int, errorMessage: String) {
        respond(id, false, error = "云存档读取失败（$errorCode）：$errorMessage")
      }
    })
  }

  private fun upload(id: String, saveJson: String) {
    if (saveJson.isBlank()) {
      respond(id, false, error = "没有可上传的本地自动存档。")
      return
    }
    if (saveJson.toByteArray(StandardCharsets.UTF_8).size > MAX_SAVE_BYTES) {
      respond(id, false, error = "存档超过 TapTap 云存档的 10 MB 限制。")
      return
    }
    try {
      JSONObject(saveJson) // Reject malformed local data before sending it to the SDK.
    } catch (_: Exception) {
      respond(id, false, error = "本地存档数据无效，未上传。")
      return
    }

    val saveFile = activity.getFileStreamPath("taptap_urban_life_save.json")
    try {
      saveFile.writeText(saveJson, StandardCharsets.UTF_8)
    } catch (_: Exception) {
      respond(id, false, error = "准备云存档文件失败。")
      return
    }
    val metadata = ArchiveMetadata.Builder()
      .setName(ARCHIVE_NAME)
      .setSummary("都市生活本地进度云备份")
      .setExtra("slot=auto;format=urban-life-save")
      .setPlaytime(0)
      .build()

    TapTapCloudSave.getArchiveList(object : TapCloudSaveRequestCallback {
      override fun onArchiveListResult(archiveList: List<ArchiveData>) {
        val existing = archiveList.firstOrNull { it.name == ARCHIVE_NAME }
        val callback = object : TapCloudSaveRequestCallback {
          override fun onArchiveCreated(archive: ArchiveData) = respond(id, true, data = archiveJson(archive))
          override fun onArchiveUpdated(archive: ArchiveData) = respond(id, true, data = archiveJson(archive))
          override fun onRequestError(errorCode: Int, errorMessage: String) {
            respond(id, false, error = "云存档上传失败（$errorCode）：$errorMessage")
          }
        }
        if (existing == null) {
          TapTapCloudSave.createArchive(metadata, saveFile.absolutePath, "", callback)
        } else {
          val uuid = existing.uuid
          if (uuid.isBlank()) {
            respond(id, false, error = "TapTap 返回的存档缺少标识，无法安全更新。")
          } else {
            TapTapCloudSave.updateArchive(uuid, metadata, saveFile.absolutePath, "", callback)
          }
        }
      }

      override fun onRequestError(errorCode: Int, errorMessage: String) {
        respond(id, false, error = "检查云存档失败（$errorCode）：$errorMessage")
      }
    })
  }

  private fun download(id: String, uuid: String, fileId: String) {
    if (uuid.isBlank() || fileId.isBlank()) {
      respond(id, false, error = "云存档条目缺少下载标识。")
      return
    }
    TapTapCloudSave.getArchiveData(uuid, fileId, object : TapCloudSaveRequestCallback {
      override fun onArchiveDataResult(archiveData: ByteArray) {
        val text = String(archiveData, StandardCharsets.UTF_8)
        respond(id, true, data = JSONObject().put("saveJson", text))
      }

      override fun onRequestError(errorCode: Int, errorMessage: String) {
        respond(id, false, error = "下载云存档失败（$errorCode）：$errorMessage")
      }
    })
  }

  private fun archiveJson(archive: ArchiveData): JSONObject = JSONObject()
    .put("uuid", archive.uuid)
    .put("fileId", archive.fileId)
    .put("name", archive.name)
    .put("summary", archive.summary)
    .put("modifiedAt", archive.modifiedTime)

  private fun respond(id: String, ok: Boolean, data: Any? = null, error: String? = null) {
    val response = JSONObject().put("id", id).put("ok", ok)
    if (data != null) response.put("data", data)
    if (error != null) response.put("error", error)
    val script = "window.dispatchEvent(new CustomEvent('urbanlife-taptap-response',{detail:${JSONObject.quote(response.toString())}}));"
    webView.post { webView.evaluateJavascript(script, null) }
  }

  private companion object {
    const val MAX_SAVE_BYTES = 10 * 1024 * 1024
    const val ARCHIVE_NAME = "urban_life_main"
  }
}
