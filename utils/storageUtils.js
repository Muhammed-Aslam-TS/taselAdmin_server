import { v4 as uuidv4 } from 'uuid';
import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";

let s3Client;

const getS3Client = () => {
  if (s3Client) return s3Client;

  const isPlaceholder = (val) => !val || val.includes('your_') || val.includes('<your');

  if (isPlaceholder(process.env.AWS_REGION) || 
      isPlaceholder(process.env.AWS_ACCESS_KEY_ID) || 
      isPlaceholder(process.env.AWS_SECRET_ACCESS_KEY) || 
      isPlaceholder(process.env.AWS_S3_BUCKET_NAME)) {
    console.error("❌ CRITICAL: AWS S3 environment variables are not correctly configured in .env file.");
  }

  s3Client = new S3Client({
    region: process.env.AWS_REGION || 'ap-south-2',
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
  });

  return s3Client;
};


/**
 * Save a buffer to AWS S3 Bucket
 */
export const saveFile = async (buffer, subFolder = '', originalName = 'file.jpg') => {
  try {
    console.log(`[Storage] Attempting AWS S3 upload...`);

    const extension = originalName.split('.').pop() || 'jpg';
    const fileName = `${uuidv4()}-${originalName.replace(/\.[^/.]+$/, "")}.${extension}`;
    const key = subFolder ? `${subFolder}/${fileName}` : fileName;

    const command = new PutObjectCommand({
      Bucket: process.env.AWS_S3_BUCKET_NAME,
      Key: key,
      Body: buffer,
      ContentType: getContentType(extension),
    });

    await getS3Client().send(command);

    // Construct the standard S3 public URL
    const publicUrl = `https://${process.env.AWS_S3_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;

    console.log(`[Storage] AWS S3 upload successful: ${publicUrl}`);
    return publicUrl;
  } catch (error) {
    console.error(`[Storage] AWS S3 upload failed:`, error.message);
    throw new Error("Failed to upload file to S3");
  }
};

/**
 * Delete a file exclusively from AWS S3
 */
export const deleteFile = async (fileUrl) => {
  try {
    if (!fileUrl || typeof fileUrl !== 'string') return;

    const s3Domain = `https://${process.env.AWS_S3_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/`;

    if (fileUrl.startsWith(s3Domain)) {
      const key = fileUrl.replace(s3Domain, '');
      const command = new DeleteObjectCommand({
        Bucket: process.env.AWS_S3_BUCKET_NAME,
        Key: key,
      });
      await getS3Client().send(command);
      console.log(`[Storage] Deleted file from AWS S3: ${key}`);
    }
  } catch (error) {
    console.error("[Storage] Error deleting file:", error);
  }
};

const getContentType = (extension) => {
  const types = {
    // Images
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'png': 'image/png',
    'gif': 'image/gif',
    'webp': 'image/webp',
    'svg': 'image/svg+xml',
    'ico': 'image/x-icon',
    'tiff': 'image/tiff',
    'bmp': 'image/bmp',

    // Videos
    'mp4': 'video/mp4',
    'webm': 'video/webm',
    'mov': 'video/quicktime',
    'avi': 'video/x-msvideo',
    'mkv': 'video/x-matroska',
    'flv': 'video/x-flv',
    'wmv': 'video/x-ms-wmv',

    // Audio
    'mp3': 'audio/mpeg',
    'wav': 'audio/wav',
    'ogg': 'audio/ogg',
    'm4a': 'audio/mp4',
    'aac': 'audio/aac',
    'flac': 'audio/x-flac',

    // Documents
    'pdf': 'application/pdf',
    'doc': 'application/msword',
    'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'xls': 'application/vnd.ms-excel',
    'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'ppt': 'application/vnd.ms-powerpoint',
    'pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'txt': 'text/plain',
    'csv': 'text/csv',
    'html': 'text/html',
    'xml': 'text/xml',
    'json': 'application/json',

    // Archives
    'zip': 'application/zip',
    'rar': 'application/x-rar-compressed',
    '7z': 'application/x-7z-compressed',
    'tar': 'application/x-tar',
    'gz': 'application/gzip'
  };
  return types[extension.toLowerCase()] || 'application/octet-stream';
};
