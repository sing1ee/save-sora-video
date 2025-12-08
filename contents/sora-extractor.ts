import type { PlasmoCSConfig } from "plasmo"

export const config: PlasmoCSConfig = {
  matches: ["https://sora.chatgpt.com/*"],
  all_frames: false
}

interface MediaItem {
  url: string
  type: 'video' | 'thumbnail'
  filename: string
}

interface ExtractedMedia {
  videos: MediaItem[]
  thumbnails: MediaItem[]
}

// 辅助函数：安全获取 meta 标签内容
function getMetaContent(property: string): string | null {
  const element = document.querySelector(`meta[property="${property}"]`)
  return element ? element.getAttribute('content') : null
}

// 生成文件名
function generateFilename(url: string, type: 'video' | 'thumbnail'): string {
  try {
    const urlObj = new URL(url)
    const pathname = urlObj.pathname
    const extension = pathname.split('.').pop() || (type === 'video' ? 'mp4' : 'jpg')
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    return `sora-${type}-${timestamp}.${extension}`
  } catch {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    return `sora-${type}-${timestamp}.${type === 'video' ? 'mp4' : 'jpg'}`
  }
}

// 主提取函数：从 meta 标签提取视频和缩略图链接
function extractMediaFromPage(): ExtractedMedia {
  const videos: MediaItem[] = []
  const thumbnails: MediaItem[] = []

  // 从 meta 标签提取视频链接
  const videoUrl = getMetaContent('og:video')
  if (videoUrl) {
    videos.push({
      url: videoUrl,
      type: 'video',
      filename: generateFilename(videoUrl, 'video')
    })
  }

  // 从 meta 标签提取缩略图链接
  const thumbnailUrl = getMetaContent('og:image')
  if (thumbnailUrl) {
    thumbnails.push({
      url: thumbnailUrl,
      type: 'thumbnail',
      filename: generateFilename(thumbnailUrl, 'thumbnail')
    })
  }

  return {
    videos,
    thumbnails
  }
}

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'extractMedia') {
    try {
      const extractedMedia = extractMediaFromPage()
      sendResponse({ success: true, data: extractedMedia })
    } catch (error) {
      sendResponse({ success: false, error: error.message })
    }
  }
  return true // Keep message channel open for async response
})

// Auto-extract when page loads
window.addEventListener('load', () => {
  setTimeout(() => {
    const extractedMedia = extractMediaFromPage()
    // Store in sessionStorage for popup to access
    sessionStorage.setItem('sora-extracted-media', JSON.stringify(extractedMedia))
  }, 2000) // Wait 2 seconds for dynamic content to load
})
