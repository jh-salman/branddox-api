import { Router } from 'express';
import { asyncHandler } from '../../middleware/asyncHandler';
import { requireAdmin } from '../../middleware/admin-auth';
import * as portfolioController from './portfolio.controller';

const router = Router();

router.get('/', asyncHandler(portfolioController.getAll));
router.post(
  '/youtube-thumbnails',
  requireAdmin,
  asyncHandler(portfolioController.youtubeThumbnails)
);
router.get('/:id', asyncHandler(portfolioController.getById));
router.post('/', requireAdmin, asyncHandler(portfolioController.create));
router.patch('/:id', requireAdmin, asyncHandler(portfolioController.update));
router.put('/:id', requireAdmin, asyncHandler(portfolioController.update));
router.delete('/:id', requireAdmin, asyncHandler(portfolioController.remove));

export const portfolioRouter = router;
