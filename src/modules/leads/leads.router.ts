import { Router } from 'express';
import { asyncHandler } from '../../middleware/asyncHandler';
import * as leadsController from './leads.controller';

const router = Router();

router.get('/', asyncHandler(leadsController.getAll));
router.get('/stats', asyncHandler(leadsController.getStats));
router.get('/:id', asyncHandler(leadsController.getById));
router.post('/', asyncHandler(leadsController.create));
router.patch('/:id', asyncHandler(leadsController.update));
router.delete('/:id', asyncHandler(leadsController.remove));

export const leadsRouter = router;
