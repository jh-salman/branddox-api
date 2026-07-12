import { Router } from 'express';
import { asyncHandler } from '../../middleware/asyncHandler';
import { requireAdmin } from '../../middleware/admin-auth';
import * as youtubeController from './youtube.controller';

const router = Router();

router.post('/search-channels', requireAdmin, asyncHandler(youtubeController.searchChannelsHandler));
router.post('/save-leads', requireAdmin, asyncHandler(youtubeController.saveLeadsHandler));
router.post('/enrich-leads', requireAdmin, asyncHandler(youtubeController.enrichLeadsHandler));

export const youtubeRouter = router;
