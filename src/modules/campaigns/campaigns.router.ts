import { Router } from 'express';
import { asyncHandler } from '../../middleware/asyncHandler';
import { requireAdmin } from '../../middleware/admin-auth';
import * as campaigns from './campaigns.controller';

const router = Router();

router.get('/config', requireAdmin, asyncHandler(campaigns.getConfigStatus));
router.post('/verify-smtp', requireAdmin, asyncHandler(campaigns.verifySmtpHandler));
router.get('/', requireAdmin, asyncHandler(campaigns.list));
router.post('/', requireAdmin, asyncHandler(campaigns.create));
router.get('/:id', requireAdmin, asyncHandler(campaigns.getOne));
router.post('/:id/send', requireAdmin, asyncHandler(campaigns.send));
router.delete('/:id', requireAdmin, asyncHandler(campaigns.remove));
router.patch('/:id/recipients/:recipientId', requireAdmin, asyncHandler(campaigns.patchRecipient));
router.post('/:id/recipients/:recipientId/deep', requireAdmin, asyncHandler(campaigns.deepRecipient));

export const campaignsRouter = router;
