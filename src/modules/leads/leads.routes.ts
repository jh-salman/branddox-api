import { Router } from 'express';
import { asyncHandler } from '../../middleware/asyncHandler';
import * as controller from './leads.controller';

const router = Router();

router.get('/', asyncHandler(controller.getAll));
router.get('/stats', asyncHandler(controller.getStats));
router.get('/:id', asyncHandler(controller.getById));
router.post('/', asyncHandler(controller.create));
router.patch('/:id', asyncHandler(controller.update));
router.delete('/:id', asyncHandler(controller.remove));

export const leadsRouter = router;
