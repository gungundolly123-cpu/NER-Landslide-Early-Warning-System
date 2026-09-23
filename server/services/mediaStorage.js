/**
 * NEXZORA — Secure Media Upload and Storage Service
 * Handles photo/video validation, MIME inspection, unique filename generation,
 * and safe disk storage.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const UPLOAD_DIR = path.join(__dirname, '..', '..', 'outputs', 'uploads');

// Ensure upload directory exists
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// Allowed MIME types & file size configurations
const ALLOWED_MIME_TYPES = {
  'image/jpeg': { ext: '.jpg', type: 'photo', maxSize: 10 * 1024 * 1024 },
  'image/jpg': { ext: '.jpg', type: 'photo', maxSize: 10 * 1024 * 1024 },
  'image/png': { ext: '.png', type: 'photo', maxSize: 10 * 1024 * 1024 },
  'image/webp': { ext: '.webp', type: 'photo', maxSize: 10 * 1024 * 1024 },
  'video/mp4': { ext: '.mp4', type: 'video', maxSize: 50 * 1024 * 1024 },
  'video/quicktime': { ext: '.mov', type: 'video', maxSize: 50 * 1024 * 1024 }
};

const DANGEROUS_EXTENSIONS = [
  '.exe', '.sh', '.bat', '.cmd', '.js', '.vbs', '.py', '.php', '.pl', '.cgi', '.jar', '.dll'
];

/**
 * Validate media file metadata and buffer
 * @param {object} fileParams
 * @param {string} fileParams.originalName
 * @param {string} fileParams.mimeType
 * @param {number} fileParams.sizeBytes
 * @param {Buffer} [fileParams.buffer]
 */
function validateMedia({ originalName, mimeType, sizeBytes, buffer }) {
  if (!originalName || !mimeType) {
    return { valid: false, error: 'Original filename and MIME type are required.' };
  }

  // Check dangerous extension
  const ext = path.extname(originalName).toLowerCase();
  if (DANGEROUS_EXTENSIONS.includes(ext)) {
    return { valid: false, error: `Executable or script files (${ext}) are strictly prohibited.` };
  }

  const cleanMime = mimeType.toLowerCase().trim();
  const config = ALLOWED_MIME_TYPES[cleanMime];

  if (!config) {
    return {
      valid: false,
      error: `Unsupported file format '${cleanMime}'. Supported formats: JPEG, PNG, WEBP, MP4, MOV.`
    };
  }

  if (sizeBytes > config.maxSize) {
    const maxMb = config.maxSize / (1024 * 1024);
    return {
      valid: false,
      error: `File size exceeds the allowed limit of ${maxMb} MB for ${config.type}s.`
    };
  }

  // Magic bytes check if buffer is provided
  if (buffer && Buffer.isBuffer(buffer)) {
    if (buffer.length < 4) {
      return { valid: false, error: 'Corrupt or empty file.' };
    }

    // JPEG magic: FF D8 FF
    if (cleanMime === 'image/jpeg' || cleanMime === 'image/jpg') {
      if (buffer[0] !== 0xFF || buffer[1] !== 0xD8 || buffer[2] !== 0xFF) {
        return { valid: false, error: 'File content does not match valid JPEG image format.' };
      }
    }
    // PNG magic: 89 50 4E 47
    else if (cleanMime === 'image/png') {
      if (buffer[0] !== 0x89 || buffer[1] !== 0x50 || buffer[2] !== 0x4E || buffer[3] !== 0x47) {
        return { valid: false, error: 'File content does not match valid PNG image format.' };
      }
    }
  }

  return {
    valid: true,
    mediaType: config.type,
    safeExtension: config.ext
  };
}

/**
 * Store media file buffer to disk
 * @param {object} params
 * @param {Buffer} params.buffer
 * @param {string} params.originalName
 * @param {string} params.mimeType
 * @param {string} params.userId
 * @returns {object} { storageUrl, filename, mimeType, sizeBytes, mediaType }
 */
function saveMediaBuffer({ buffer, originalName, mimeType, userId }) {
  const sizeBytes = buffer ? buffer.length : 0;
  const validation = validateMedia({ originalName, mimeType, sizeBytes, buffer });

  if (!validation.valid) {
    throw new Error(validation.error);
  }

  const safeId = 'med_' + crypto.randomUUID();
  const safeFilename = `${safeId}${validation.safeExtension}`;
  const filePath = path.join(UPLOAD_DIR, safeFilename);

  fs.writeFileSync(filePath, buffer);

  const storageUrl = `/outputs/uploads/${safeFilename}`;

  return {
    id: safeId,
    storageUrl,
    thumbnailUrl: validation.mediaType === 'photo' ? storageUrl : null,
    filename: safeFilename,
    originalFilename: path.basename(originalName),
    mimeType,
    sizeBytes,
    mediaType: validation.mediaType,
    uploadedBy: userId,
    createdAt: new Date().toISOString()
  };
}

/**
 * Process base64 data URL string (e.g. data:image/png;base64,iVBORw0KGgo...)
 * @param {string} dataUrl
 * @param {string} originalName
 * @param {string} userId
 */
function saveBase64Media(dataUrl, originalName, userId) {
  if (!dataUrl || typeof dataUrl !== 'string') {
    throw new Error('Invalid media data provided.');
  }

  const matches = dataUrl.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
  if (!matches || matches.length !== 3) {
    throw new Error('Invalid base64 Data URL format.');
  }

  const mimeType = matches[1];
  const buffer = Buffer.from(matches[2], 'base64');
  return saveMediaBuffer({ buffer, originalName: originalName || `upload_${Date.now()}`, mimeType, userId });
}

/**
 * Delete a media file from storage safely
 * @param {string} storageUrl
 */
function deleteMediaFile(storageUrl) {
  try {
    if (!storageUrl || !storageUrl.startsWith('/outputs/uploads/')) return false;
    const filename = path.basename(storageUrl);
    const filePath = path.join(UPLOAD_DIR, filename);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      return true;
    }
  } catch (err) {
    console.warn('[Media Storage] Delete file error:', err.message);
  }
  return false;
}

module.exports = {
  validateMedia,
  saveMediaBuffer,
  saveBase64Media,
  deleteMediaFile,
  UPLOAD_DIR,
  ALLOWED_MIME_TYPES
};
