import { Readable } from 'stream';
import { v2 as cloudinary } from 'cloudinary';
import { config } from '../config';

export function ensureCloudinaryConfigured(): void {
  if (!config.cloudinary.cloudName || !config.cloudinary.apiKey || !config.cloudinary.apiSecret) {
    throw new Error('Cloudinary is not configured. Set CLOUDINARY_* env vars.');
  }
  cloudinary.config({
    cloud_name: config.cloudinary.cloudName,
    api_key: config.cloudinary.apiKey,
    api_secret: config.cloudinary.apiSecret,
  });
}

/** Upload a remote image URL to Cloudinary (same pattern as multipart upload). */
export async function uploadRemoteUrlToCloudinary(
  imageUrl: string,
  folder: string
): Promise<string> {
  ensureCloudinaryConfigured();
  return new Promise((resolve, reject) => {
    cloudinary.uploader.upload(
      imageUrl,
      { folder },
      (err, result) => {
        if (err) reject(err);
        else if (result?.secure_url) resolve(result.secure_url);
        else reject(new Error('Cloudinary upload failed'));
      }
    );
  });
}

/** Upload raw image buffer to Cloudinary (used by multipart routes). */
export function uploadBufferToCloudinary(buffer: Buffer, folder: string): Promise<{ secure_url: string }> {
  ensureCloudinaryConfigured();
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream({ folder }, (err, result) => {
      if (err) reject(err);
      else if (result) resolve(result as { secure_url: string });
      else reject(new Error('Upload failed'));
    });
    Readable.from(buffer).pipe(stream);
  });
}
