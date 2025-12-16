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

// 主提取函数：从 JSON-LD（VideoObject）中提取视频和缩略图链接
function extractMediaFromPage(): ExtractedMedia {
  const videos: MediaItem[] = []
  const thumbnails: MediaItem[] = []

  // 1. 获取页面上所有 JSON-LD 脚本标签
  const scripts = document.querySelectorAll('script[type="application/ld+json"]')

  let targetData: any = null

  // 2. 遍历查找包含 VideoObject 的脚本
  for (const script of Array.from(scripts)) {
    try {
      const text = script.textContent || script.innerHTML || ""
      if (!text.trim()) continue

      const json = JSON.parse(text)

      // 兼容数组或单对象结构
      const candidates = Array.isArray(json) ? json : [json]
      for (const item of candidates) {
        if (item && item['@type'] === 'VideoObject') {
          targetData = item
          break
        }
      }

      if (targetData) break
    } catch {
      // 忽略解析失败的脚本
      continue
    }
  }

  if (!targetData) {
    throw new Error('未在页面中找到 VideoObject 数据')
  }

  // 3. 提取数据（兼容 thumbnailUrl 为数组或字符串）
  const videoUrl: string | undefined = targetData.contentUrl

  let thumbnailUrl: string | undefined
  if (Array.isArray(targetData.thumbnailUrl)) {
    thumbnailUrl = targetData.thumbnailUrl[0]
  } else {
    thumbnailUrl = targetData.thumbnailUrl
  }

  if (videoUrl) {
    videos.push({
      url: videoUrl,
      type: 'video',
      filename: generateFilename(videoUrl, 'video')
    })
  }

  if (thumbnailUrl) {
    thumbnails.push({
      url: thumbnailUrl,
      type: 'thumbnail',
      filename: generateFilename(thumbnailUrl, 'thumbnail')
    })
  }

  return { videos, thumbnails }
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
