import { useState, useEffect } from "react"

interface MediaItem {
  url: string
  type: 'video' | 'thumbnail'
  filename: string
}

interface ExtractedMedia {
  videos: MediaItem[]
  thumbnails: MediaItem[]
}

function IndexPopup() {
  const [extractedMedia, setExtractedMedia] = useState<ExtractedMedia>({ videos: [], thumbnails: [] })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [downloading, setDownloading] = useState<Set<string>>(new Set())
  const [isSoraPage, setIsSoraPage] = useState<boolean>(false)
  const [activeTabId, setActiveTabId] = useState<number | null>(null)

  const extractMedia = async () => {
    if (!isSoraPage || activeTabId == null) {
      setError("Please navigate to a Sora video page first")
      return
    }

    setLoading(true)
    setError(null)

    try {
      const response = await chrome.tabs.sendMessage(activeTabId, { action: 'extractMedia' })
      if (response?.success) {
        setExtractedMedia(response.data)
      } else {
        throw new Error(response?.error || "Failed to extract media")
      }
    } catch (err: any) {
      setError(err?.message || "Failed to extract media from page")
    } finally {
      setLoading(false)
    }
  }

  // 根据 MIME 类型获取文件扩展名
  const getExtensionFromMime = (mimeType: string): string => {
    const mimeMap: Record<string, string> = {
      'video/mp4': 'mp4',
      'video/webm': 'webm',
      'video/quicktime': 'mov',
      'video/x-msvideo': 'avi',
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/webp': 'webp',
      'image/gif': 'gif'
    }
    return mimeMap[mimeType] || ''
  }

  // 确保文件名有正确的扩展名
  const ensureExtension = (filename: string, mimeType: string, type: 'video' | 'thumbnail'): string => {
    const ext = getExtensionFromMime(mimeType)
    const defaultExt = type === 'video' ? 'mp4' : 'jpg'
    const finalExt = ext || defaultExt
    
    // 检查文件名是否已有正确的扩展名
    const hasExt = /\.(mp4|webm|mov|avi|jpg|jpeg|png|webp|gif)$/i.test(filename)
    if (hasExt) {
      return filename
    }
    
    return `${filename}.${finalExt}`
  }

  // 清理文件名，移除不合法字符，避免 chrome.downloads 报 "Invalid filename"
  const sanitizeFilename = (rawName: string, type: 'video' | 'thumbnail'): string => {
    const fallbackBase = type === 'video' ? 'sora-video' : 'sora-thumbnail'
    let name = rawName || ''

    // 去掉路径信息（仅保留最后一段）
    name = name.split(/[/\\]/).pop() || ''

    // 移除常见非法字符  \ / : * ? " < > | 和控制字符
    name = name.replace(/[\\/:*?"<>|\u0000-\u001F]/g, '_')

    // 去掉首尾空格和点，避免隐藏文件或无效名
    name = name.trim().replace(/^\.+/, '').replace(/\.+$/, '')

    if (!name) {
      const ts = new Date().toISOString().replace(/[:.]/g, '-')
      name = `${fallbackBase}-${ts}.${type === 'video' ? 'mp4' : 'jpg'}`
    }

    return name
  }

  const downloadFile = async (url: string, filename: string, type: 'video' | 'thumbnail' = 'video') => {
    setDownloading(prev => new Set(prev).add(url))
    
    try {
      // 基于原始文件名简单确保扩展名并做合法化处理
      const withExt = ensureExtension(filename, '', type)
      const finalFilename = sanitizeFilename(withExt, type)
      
      // 使用 chrome.downloads.download API
      await chrome.downloads.download({
        url: url,
        filename: finalFilename,
        saveAs: false
      })
    } catch (err) {
      console.error('Download failed:', err)
      setError(`Failed to download: ${err.message || 'Unknown error'}`)
    } finally {
      setDownloading(prev => {
        const newSet = new Set(prev)
        newSet.delete(url)
        return newSet
      })
    }
  }

  const downloadAll = async () => {
    // 下载视频
    for (const video of extractedMedia.videos) {
      await downloadFile(video.url, video.filename, 'video')
      await new Promise(resolve => setTimeout(resolve, 500))
    }
    // 下载缩略图
    for (const thumbnail of extractedMedia.thumbnails) {
      await downloadFile(thumbnail.url, thumbnail.filename, 'thumbnail')
      await new Promise(resolve => setTimeout(resolve, 500))
    }
  }

  useEffect(() => {
    const init = async () => {
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
        const url = tab?.url || ""
        const isSora = url.startsWith('https://sora.chatgpt.com/')
        setIsSoraPage(isSora)
        setActiveTabId(tab?.id ?? null)
        if (isSora && tab?.id) {
          // auto extract on open
          const response = await chrome.tabs.sendMessage(tab.id, { action: 'extractMedia' })
          if (response?.success) {
            setExtractedMedia(response.data)
          }
        }
      } catch (e) {
        // ignore
      }
    }
    init()
  }, [])

  if (!isSoraPage) {
    return (
      <div style={{ 
        width: 400, 
        padding: 20, 
        fontFamily: 'system-ui, -apple-system, sans-serif',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        color: 'white',
        minHeight: 200
      }}>
        <div style={{ textAlign: 'center' }}>
          <h2 style={{ margin: '0 0 16px 0', fontSize: '20px' }}>🎬 Sora Video Downloader</h2>
          <p style={{ margin: '0 0 20px 0', opacity: 0.9 }}>
            Navigate to a Sora video page to start downloading videos and thumbnails
          </p>
          <a 
            href="https://sora.chatgpt.com" 
            target="_blank"
            style={{
              display: 'inline-block',
              padding: '10px 20px',
              background: 'rgba(255,255,255,0.2)',
              color: 'white',
              textDecoration: 'none',
              borderRadius: '8px',
              border: '1px solid rgba(255,255,255,0.3)',
              transition: 'all 0.3s ease'
            }}
            onMouseOver={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.3)'}
            onMouseOut={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.2)'}
          >
            Go to Sora
          </a>
        </div>
      </div>
    )
  }

  // Calculate dynamic height based on content
  const calculateHeight = () => {
    const baseHeight = 180 // Header + basic padding
    const buttonHeight = 50 // Extract button
    const downloadAllHeight = extractedMedia.videos.length > 0 || extractedMedia.thumbnails.length > 0 ? 45 : 0
    const errorHeight = error ? 60 : 0
    const videoSectionHeight = extractedMedia.videos.length > 0 ? 40 + extractedMedia.videos.length * 45 : 0
    const thumbnailSectionHeight = extractedMedia.thumbnails.length > 0 ? 40 + extractedMedia.thumbnails.length * 45 : 0
    const padding = 40 // Top and bottom padding

    const totalHeight = baseHeight + buttonHeight + downloadAllHeight + errorHeight +
                       videoSectionHeight + thumbnailSectionHeight + padding
    return Math.min(Math.max(totalHeight, 300), 800) // Min 300px, max 800px
  }

  return (
    <div style={{
      width: 480,
      height: calculateHeight(),
      fontFamily: 'system-ui, -apple-system, sans-serif',
      background: 'white',
      border: '1px solid #e1e5e9',
      display: 'flex',
      flexDirection: 'column'
    }}>
      {/* Header */}
      <div style={{ 
        padding: '16px 20px', 
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        color: 'white'
      }}>
        <h2 style={{ margin: 0, fontSize: '18px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          🎬 Sora Video Downloader
      </h2>
        <p style={{ margin: '4px 0 0 0', fontSize: '12px', opacity: 0.9 }}>
          Extract and download videos & thumbnails
        </p>
      </div>

      {/* Content */}
      <div style={{
        padding: '20px',
        flex: 1,
        overflowY: 'auto',
        minHeight: 0
      }}>
        {error && (
          <div style={{ 
            padding: '12px', 
            background: '#fee', 
            color: '#c33', 
            borderRadius: '6px', 
            marginBottom: '16px',
            fontSize: '14px'
          }}>
            {error}
          </div>
        )}

        {/* Extract Button */}
        <button
          onClick={extractMedia}
          disabled={loading}
          style={{
            width: '100%',
            padding: '12px',
            background: loading ? '#ccc' : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            fontSize: '14px',
            fontWeight: '500',
            cursor: loading ? 'not-allowed' : 'pointer',
            marginBottom: '20px',
            transition: 'all 0.3s ease'
          }}
        >
          {loading ? '🔄 Extracting...' : '🔍 Extract Media'}
        </button>

        {/* Results */}
        {extractedMedia.videos.length > 0 || extractedMedia.thumbnails.length > 0 ? (
          <>
            {/* Download All Button */}
            <button
              onClick={downloadAll}
              disabled={downloading.size > 0}
              style={{
                width: '100%',
                padding: '10px',
                background: downloading.size > 0 ? '#ccc' : '#28a745',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                fontSize: '13px',
                fontWeight: '500',
                cursor: downloading.size > 0 ? 'not-allowed' : 'pointer',
                marginBottom: '16px'
              }}
            >
              {downloading.size > 0 ? '📥 Downloading...' : '📥 Download All'}
            </button>

            {/* Videos Section */}
            {extractedMedia.videos.length > 0 && (
              <div style={{ marginBottom: '20px' }}>
                <h3 style={{ 
                  margin: '0 0 12px 0', 
                  fontSize: '16px', 
                  color: '#333',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}>
                  🎥 Videos ({extractedMedia.videos.length})
                </h3>
                <div style={{ maxHeight: 'none', overflowY: 'visible' }}>
                  {extractedMedia.videos.map((video, index) => (
                    <div key={index} style={{ 
                      padding: '8px 12px', 
                      background: '#f8f9fa', 
                      borderRadius: '6px', 
                      marginBottom: '8px',
                      border: '1px solid #e9ecef'
                    }}>
                      <div style={{ fontSize: '12px', color: '#666', marginBottom: '4px' }}>
                        {video.filename}
                      </div>
                      <div style={{ 
                        display: 'flex', 
                        justifyContent: 'space-between', 
                        alignItems: 'center' 
                      }}>
                        <div style={{ 
                          fontSize: '11px', 
                          color: '#888', 
                          maxWidth: '250px',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap'
                        }}>
                          {video.url}
                        </div>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button
                            onClick={() => navigator.clipboard.writeText(video.url)}
                            style={{
                              padding: '4px 8px',
                              background: '#6c757d',
                              color: 'white',
                              border: 'none',
                              borderRadius: '4px',
                              fontSize: '11px',
                              cursor: 'pointer'
                            }}
                          >
                            Copy
                          </button>
                          <button
                            onClick={() => downloadFile(video.url, video.filename, 'video')}
                            disabled={downloading.has(video.url)}
                            style={{
                              padding: '4px 8px',
                              background: downloading.has(video.url) ? '#ccc' : '#007bff',
                              color: 'white',
                              border: 'none',
                              borderRadius: '4px',
                              fontSize: '11px',
                              cursor: downloading.has(video.url) ? 'not-allowed' : 'pointer'
                            }}
                          >
                            {downloading.has(video.url) ? '⏳' : '⬇️'}
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Thumbnails Section */}
            {extractedMedia.thumbnails.length > 0 && (
              <div>
                <h3 style={{ 
                  margin: '0 0 12px 0', 
                  fontSize: '16px', 
                  color: '#333',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}>
                  🖼️ Thumbnails ({extractedMedia.thumbnails.length})
                </h3>
                <div style={{ maxHeight: 'none', overflowY: 'visible' }}>
                  {extractedMedia.thumbnails.map((thumbnail, index) => (
                    <div key={index} style={{ 
                      padding: '8px 12px', 
                      background: '#f8f9fa', 
                      borderRadius: '6px', 
                      marginBottom: '8px',
                      border: '1px solid #e9ecef'
                    }}>
                      <div style={{ fontSize: '12px', color: '#666', marginBottom: '4px' }}>
                        {thumbnail.filename}
                      </div>
                      <div style={{ 
                        display: 'flex', 
                        justifyContent: 'space-between', 
                        alignItems: 'center' 
                      }}>
                        <div style={{ 
                          fontSize: '11px', 
                          color: '#888', 
                          maxWidth: '250px',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap'
                        }}>
                          {thumbnail.url}
                        </div>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button
                            onClick={() => navigator.clipboard.writeText(thumbnail.url)}
                            style={{
                              padding: '4px 8px',
                              background: '#6c757d',
                              color: 'white',
                              border: 'none',
                              borderRadius: '4px',
                              fontSize: '11px',
                              cursor: 'pointer'
                            }}
                          >
                            Copy
                          </button>
                          <button
                            onClick={() => downloadFile(thumbnail.url, thumbnail.filename, 'thumbnail')}
                            disabled={downloading.has(thumbnail.url)}
                            style={{
                              padding: '4px 8px',
                              background: downloading.has(thumbnail.url) ? '#ccc' : '#28a745',
                              color: 'white',
                              border: 'none',
                              borderRadius: '4px',
                              fontSize: '11px',
                              cursor: downloading.has(thumbnail.url) ? 'not-allowed' : 'pointer'
                            }}
                          >
                            {downloading.has(thumbnail.url) ? '⏳' : '⬇️'}
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        ) : !loading && (
          <div style={{ 
            textAlign: 'center', 
            color: '#666', 
            fontSize: '14px',
            padding: '20px 0'
          }}>
            No media found. Click "Extract Media" to scan the page.
          </div>
        )}
      </div>
    </div>
  )
}

export default IndexPopup
