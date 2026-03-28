import { Router, Request, Response } from 'express';
import multer from 'multer';
import { uploadBufferToCloudinary } from '../../lib/cloudinary-upload';
import { requireAdmin } from '../../middleware/admin-auth';

const memoryStorage = multer.memoryStorage();
const upload = multer({
  storage: memoryStorage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (_req, file, cb) => {
    const allowed = /^image\/(jpe?g|png|gif|webp)$/i;
    if (allowed.test(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only images (jpeg, png, gif, webp) are allowed'));
    }
  },
});

export const uploadRouter = Router();

uploadRouter.post('/', requireAdmin, upload.single('image'), async (req: Request, res: Response) => {
  const file = req.file;
  if (!file) {
    res.status(400).json({ error: 'No image file provided. Use field name "image".' });
    return;
  }
  try {
    const result = await uploadBufferToCloudinary(file.buffer, 'branddox/portfolio');
    res.status(201).json({ url: result.secure_url });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Upload failed';
    // eslint-disable-next-line no-console
    console.error('[upload] Cloudinary error:', err);
    res.status(500).json({ error: message });
  }
});
