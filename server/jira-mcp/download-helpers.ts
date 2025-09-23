import { logger } from '../observability/logger.ts';

/**
 * Extract HTTP(S) image URLs from markdown
 * @param markdown - Markdown content to scan
 * @returns Array of HTTP image URL objects
 */
export function extractHttpImageUrls(markdown: string): Array<{
  url: string;
  altText: string;
  title?: string;
  fullMatch: string;
}> {
  console.log('Extracting HTTP(S) image URLs from markdown');
  
  // Regex to match ![alt](https://... "title") or ![alt](https://...)
  const httpImageRegex = /!\[([^\]]*)\]\((https?:\/\/[^\s\)]+)(?:\s+"([^"]*)")? *\)/g;
  const imageUrls: Array<{
    url: string;
    altText: string;
    title?: string;
    fullMatch: string;
  }> = [];
  
  let match;
  while ((match = httpImageRegex.exec(markdown)) !== null) {
    imageUrls.push({
      url: match[2],
      altText: match[1],
      title: match[3],
      fullMatch: match[0]
    });
  }
  
  console.log('  Found HTTP image URLs', {
    count: imageUrls.length,
    urls: imageUrls.map(img => img.url)
  });
  
  return imageUrls;
}

/**
 * Download HTTP images and convert to attachment format
 * @param imageUrls - Array of image URL objects
 * @returns Array of attachment objects ready for upload
 */
export async function downloadHttpImages(
  imageUrls: Array<{
    url: string;
    altText: string;
    title?: string;
    fullMatch: string;
  }>
): Promise<Array<{
  filename: string;
  content: string; // base64-encoded
  mimeType: string;
  markdownRef: string;
}>> {
  console.log('Downloading HTTP images', { count: imageUrls.length });
  
  if (imageUrls.length === 0) {
    return [];
  }
  
  const downloadedAttachments: Array<{
    filename: string;
    content: string;
    mimeType: string;
    markdownRef: string;
  }> = [];
  
  for (const imageUrl of imageUrls) {
    console.log('  Downloading image', { url: imageUrl.url });
    
    try {
      const response = await fetch(imageUrl.url);
      
      if (!response.ok) {
        logger.warn('Failed to download image', {
          url: imageUrl.url,
          status: response.status,
          statusText: response.statusText
        });
        continue; // Skip this image, continue with others
      }
      
      const buffer = await response.arrayBuffer();
      const base64Content = Buffer.from(buffer).toString('base64');
      
      // Determine MIME type from response headers or URL
      let mimeType = response.headers.get('content-type') || 'application/octet-stream';
      
      // Fallback: guess MIME type from URL extension
      if (mimeType === 'application/octet-stream') {
        const urlPath = new URL(imageUrl.url).pathname;
        const extension = urlPath.split('.').pop()?.toLowerCase();
        switch (extension) {
          case 'png':
            mimeType = 'image/png';
            break;
          case 'jpg':
          case 'jpeg':
            mimeType = 'image/jpeg';
            break;
          case 'gif':
            mimeType = 'image/gif';
            break;
          case 'webp':
            mimeType = 'image/webp';
            break;
          case 'svg':
            mimeType = 'image/svg+xml';
            break;
          default:
            mimeType = 'image/png'; // Default fallback
        }
      }
      
      // Generate filename from URL
      const urlPath = new URL(imageUrl.url).pathname;
      let filename = urlPath.split('/').pop() || 'image';
      
      // If no extension, add one based on MIME type
      if (!filename.includes('.')) {
        const extension = mimeType.split('/')[1] || 'png';
        filename += `.${extension}`;
      }
      
      // Ensure filename is not too long
      if (filename.length > 100) {
        const extension = filename.split('.').pop();
        filename = filename.substring(0, 90) + '...' + (extension ? `.${extension}` : '');
      }
      
      downloadedAttachments.push({
        filename,
        content: base64Content,
        mimeType,
        markdownRef: imageUrl.url // Use full URL as reference
      });
      
      console.log('  Successfully downloaded image', {
        url: imageUrl.url,
        filename,
        mimeType,
        sizeBytes: buffer.byteLength
      });
      
    } catch (error: any) {
      logger.warn('Error downloading image', {
        url: imageUrl.url,
        error: error.message
      });
      // Continue with other images even if one fails
    }
  }
  
  console.log('Completed downloading HTTP images', {
    attempted: imageUrls.length,
    successful: downloadedAttachments.length
  });
  
  return downloadedAttachments;
}